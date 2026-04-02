#!/usr/bin/env node
/**
 * Background webhook retry worker.
 * Polls webhook_deliveries for failed attempts and retries independently
 * of the Next.js request lifecycle.
 *
 * Run: node --import tsx scripts/webhook-retry-worker.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// Direct imports from helpers — no Next.js dependencies
import {
  incrementFailure,
  markDeliveryFailed,
  markDeliverySuccess,
  resetWebhookFailureState,
  sendWebhookRequest,
  type WebhookRecord,
} from '../src/lib/webhook-helpers';

const POLL_INTERVAL_MS = 10_000;
const MAX_DELIVERIES_PER_CYCLE = 10;

interface DeliveryPayload {
  event?: {
    event: string;
    timestamp?: string;
  };
  url?: string;
  secret?: string;
  signature?: string;
}

interface PendingDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: 'pending_retry' | 'retrying';
  attempts: number;
  max_retries: number;
  retry_delay_ms: number;
  last_retry_at: string | null;
  payload: DeliveryPayload | null;
  webhooks: WebhookRecord[] | WebhookRecord | null;
}

// --- Init ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`[${ts()}] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let stopping = false;
let timer: NodeJS.Timeout | null = null;

// --- Helpers ---

function ts() { return new Date().toISOString(); }

function log(msg: string, meta?: Record<string, unknown>) {
  const line = `[${ts()}] ${msg}`;
  meta ? console.log(line, JSON.stringify(meta)) : console.log(line);
}

function sleep(ms: number) {
  return new Promise<void>(resolve => { timer = setTimeout(resolve, ms); });
}

function shouldRetry(d: PendingDelivery): boolean {
  if (d.attempts >= d.max_retries) return false;
  if (!d.last_retry_at) return true;
  const elapsed = Date.now() - new Date(d.last_retry_at).getTime();
  return elapsed >= d.retry_delay_ms;
}

function resolveWebhook(d: PendingDelivery): WebhookRecord | null {
  if (!d.webhooks) return null;
  // Supabase join returns array or object depending on cardinality
  if (Array.isArray(d.webhooks)) return d.webhooks[0] ?? null;
  return d.webhooks;
}

// --- Core ---

async function fetchPending(): Promise<PendingDelivery[]> {
  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select(`
      id, webhook_id, event, status, attempts,
      max_retries, retry_delay_ms, last_retry_at, payload,
      webhooks ( id, agent_id, url, secret, failure_count, is_active )
    `)
    .in('status', ['pending_retry', 'retrying'])
    .order('last_retry_at', { ascending: true, nullsFirst: true })
    .limit(MAX_DELIVERIES_PER_CYCLE);

  if (error) throw error;
  return ((data || []) as PendingDelivery[]).filter(shouldRetry);
}

async function processDelivery(delivery: PendingDelivery): Promise<void> {
  const webhook = resolveWebhook(delivery);

  if (!webhook) {
    log('Skipping — missing webhook record', { id: delivery.id });
    await markDeliveryFailed(supabase, delivery.id, 0);
    return;
  }

  const p = delivery.payload;
  const url = p?.url || webhook.url;
  const signature = p?.signature;
  const timestamp = p?.event?.timestamp;
  const eventName = p?.event?.event || delivery.event;

  if (!url || !signature || !timestamp || !p?.event) {
    log('Skipping — incomplete payload', { id: delivery.id });
    await markDeliveryFailed(supabase, delivery.id, 0);
    await incrementFailure(supabase, webhook);
    return;
  }

  const nextAttempt = delivery.attempts + 1;
  const now = new Date().toISOString();

  // Mark as retrying
  await supabase.from('webhook_deliveries').update({
    status: 'retrying',
    attempts: nextAttempt,
    last_retry_at: now,
  }).eq('id', delivery.id);

  log('Retrying', { id: delivery.id, attempt: nextAttempt, max: delivery.max_retries });

  const result = await sendWebhookRequest({
    deliveryId: delivery.id,
    url,
    eventName,
    timestamp,
    signature,
    payload: JSON.stringify(p.event),
  });

  if (result.ok) {
    await markDeliverySuccess(supabase, delivery.id, result.responseStatus);
    await resetWebhookFailureState(supabase, delivery.webhook_id);
    log('✓ Delivered', { id: delivery.id, attempt: nextAttempt, status: result.responseStatus });
    return;
  }

  // Terminal failure?
  if (nextAttempt >= delivery.max_retries) {
    await markDeliveryFailed(supabase, delivery.id, result.responseStatus);
    await incrementFailure(supabase, webhook);
    log('✗ Permanently failed', { id: delivery.id, attempt: nextAttempt, reason: result.reason });
    return;
  }

  // Will retry again next cycle
  await supabase.from('webhook_deliveries').update({
    status: 'pending_retry',
    response_status: result.responseStatus || null,
    last_retry_at: now,
  }).eq('id', delivery.id);

  log('Will retry', { id: delivery.id, attempt: nextAttempt, reason: result.reason });
}

async function runCycle() {
  const deliveries = await fetchPending();
  if (deliveries.length === 0) return;

  log(`Processing ${deliveries.length} pending retries`);
  for (const d of deliveries) {
    if (stopping) break;
    try {
      await processDelivery(d);
    } catch (err) {
      log('Error processing delivery', {
        id: d.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// --- Main loop ---

async function main() {
  log('Webhook retry worker started');

  while (!stopping) {
    try {
      await runCycle();
    } catch (err) {
      log('Cycle error', { error: err instanceof Error ? err.message : String(err) });
    }
    if (stopping) break;
    await sleep(POLL_INTERVAL_MS);
  }

  log('Webhook retry worker stopped');
}

process.on('SIGINT', () => { stopping = true; if (timer) clearTimeout(timer); });
process.on('SIGTERM', () => { stopping = true; if (timer) clearTimeout(timer); });

void main().catch(err => {
  console.error(`[${ts()}] Worker crashed:`, err);
  process.exit(1);
});

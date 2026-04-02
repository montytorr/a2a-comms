import crypto from 'crypto';
import { createServerClient } from './supabase/server';
import { resolveAndValidateHost } from './url-validator';
import { logWebhookDelivery, logWebhookDisabled } from './security-events';

interface WebhookEvent {
  event: string;
  contract_id?: string;
  approval_id?: string;
  project_id?: string;
  task_id?: string;
  sprint_id?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

/**
 * Deliver webhooks for an event to all subscribed agents.
 * Retries failed deliveries up to 5 times with 5-second delays.
 *
 * ## Delivery Policy
 * - Each delivery gets a unique UUID (`X-Webhook-Delivery-Id` header)
 * - Signature version is included as `X-Webhook-Signature-Version: v1`
 * - Failed deliveries retry up to 5 times with 5s delay between attempts
 * - All deliveries are logged to `webhook_deliveries` table for audit
 * - Webhooks are auto-disabled after 10 consecutive failures
 * - Consecutive failure count only increments after all retries exhausted
 * - Receivers should use `X-Webhook-Delivery-Id` for deduplication
 */
export async function deliverWebhooks(
  targetAgentIds: string[],
  event: WebhookEvent
): Promise<void> {
  const supabase = createServerClient();

  // Fetch active webhooks for target agents that subscribe to this event
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('*')
    .in('agent_id', targetAgentIds)
    .eq('is_active', true)
    .contains('events', [event.event]);

  // Legacy compatibility: if this is a contract.* event, also match webhooks
  // subscribed to the legacy 'contract_state' event type
  let legacyWebhooks: typeof webhooks = [];
  if (event.event.startsWith('contract.')) {
    const { data: legacy } = await supabase
      .from('webhooks')
      .select('*')
      .in('agent_id', targetAgentIds)
      .eq('is_active', true)
      .contains('events', ['contract_state']);
    legacyWebhooks = legacy || [];
  }

  // Merge and deduplicate by webhook ID
  const webhookMap = new Map<string, (typeof webhooks extends (infer T)[] | null ? T : never)>();
  for (const wh of (webhooks || [])) webhookMap.set(wh.id, wh);
  for (const wh of legacyWebhooks) webhookMap.set(wh.id, wh);
  const allWebhooks = Array.from(webhookMap.values());

  if (allWebhooks.length === 0) return;

  // Deliver to each webhook in parallel (with retries)
  const deliveries = allWebhooks.map(async (wh) => {
    const deliveryId = crypto.randomUUID();
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', wh.secret)
      .update(payload)
      .digest('hex');

    // Create delivery record with retry metadata
    await supabase.from('webhook_deliveries').insert({
      id: deliveryId,
      webhook_id: wh.id,
      event: event.event,
      status: 'pending',
      attempts: 0,
      max_retries: MAX_RETRIES,
      retry_delay_ms: RETRY_DELAY_MS,
    });

    // DNS validation (non-retryable)
    const dnsCheck = await resolveAndValidateHost(wh.url);
    if (!dnsCheck.valid) {
      await supabase.from('webhook_deliveries').update({
        status: 'failed',
        attempts: 1,
        delivered_at: new Date().toISOString(),
      }).eq('id', deliveryId);
      await incrementFailure(supabase, wh);
      logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: 'DNS validation failed' }).catch(() => {});
      return;
    }

    // Retry loop
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Wait before retry (not before first attempt)
      if (attempt > 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        await supabase.from('webhook_deliveries').update({
          last_retry_at: new Date().toISOString(),
        }).eq('id', deliveryId);
      }

      // Update attempts count
      await supabase.from('webhook_deliveries').update({
        status: attempt === 1 ? 'pending' : 'retrying',
        attempts: attempt,
      }).eq('id', deliveryId);

      try {
        const resp = await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Signature-Version': 'v1',
            'X-Webhook-Event': event.event,
            'X-Webhook-Timestamp': event.timestamp,
            'X-Webhook-Delivery-Id': deliveryId,
          },
          body: payload,
          signal: AbortSignal.timeout(10000), // 10s timeout per attempt
          redirect: 'manual', // Prevent redirect-based SSRF
        });

        // Treat redirects as failures (3xx)
        if (resp.status >= 300 && resp.status < 400) {
          if (attempt === MAX_RETRIES) {
            await markDeliveryFailed(supabase, deliveryId, resp.status);
            await incrementFailure(supabase, wh);
            logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: `Redirect ${resp.status}`, attempts: attempt }).catch(() => {});
          }
          continue; // retry
        }

        if (resp.ok) {
          await markDeliverySuccess(supabase, deliveryId, resp.status);
          await supabase
            .from('webhooks')
            .update({ last_delivery_at: new Date().toISOString(), failure_count: 0 })
            .eq('id', wh.id);
          logWebhookDelivery('success', wh.id, wh.agent_id, wh.url, { attempts: attempt }).catch(() => {});
          return; // success — stop retrying
        }

        // Non-2xx, non-redirect response
        if (attempt === MAX_RETRIES) {
          await markDeliveryFailed(supabase, deliveryId, resp.status);
          await incrementFailure(supabase, wh);
          logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { status: resp.status, attempts: attempt }).catch(() => {});
        }
        // else continue to next retry
      } catch {
        if (attempt === MAX_RETRIES) {
          await markDeliveryFailed(supabase, deliveryId, 0);
          await incrementFailure(supabase, wh);
          logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: 'Network error', attempts: attempt }).catch(() => {});
        }
        // else continue to next retry
      }
    }
  });

  await Promise.allSettled(deliveries);
}

interface WebhookRecord {
  id: string;
  agent_id: string;
  url: string;
  secret: string;
  failure_count: number;
  is_active: boolean;
}

async function incrementFailure(supabase: ReturnType<typeof createServerClient>, wh: WebhookRecord) {
  const newCount = (wh.failure_count || 0) + 1;
  const willDisable = newCount >= 10;
  await supabase
    .from('webhooks')
    .update({
      failure_count: newCount,
      // Auto-disable after 10 consecutive failures
      is_active: !willDisable,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wh.id);

  if (willDisable && wh.is_active) {
    logWebhookDisabled(wh.id, wh.agent_id, wh.url, newCount).catch(() => {});
  }
}

async function markDeliverySuccess(
  supabase: ReturnType<typeof createServerClient>,
  deliveryId: string,
  responseStatus: number
) {
  await supabase
    .from('webhook_deliveries')
    .update({
      status: 'success',
      response_status: responseStatus,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
}

async function markDeliveryFailed(
  supabase: ReturnType<typeof createServerClient>,
  deliveryId: string,
  responseStatus: number
) {
  await supabase
    .from('webhook_deliveries')
    .update({
      status: 'failed',
      response_status: responseStatus || null,
      delivered_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
}

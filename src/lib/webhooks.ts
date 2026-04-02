import crypto from 'crypto';
import { createServerClient } from './supabase/server';
import { resolveAndValidateHost } from './url-validator';
import { logWebhookDelivery } from './security-events';
import {
  MAX_RETRIES,
  RETRY_DELAY_MS,
  incrementFailure,
  markDeliverySuccess,
  markDeliveryFailed,
  resetWebhookFailureState,
  sendWebhookRequest,
  setWebhookLoggers,
} from './webhook-helpers';

// Wire in real security event loggers (Next.js context)
import { logWebhookDisabled } from './security-events';
setWebhookLoggers({
  logDelivery: logWebhookDelivery,
  logDisabled: logWebhookDisabled,
});

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

/**
 * Deliver webhooks for an event to all subscribed agents.
 * Performs one synchronous attempt, then enqueues failed deliveries for the
 * background retry worker.
 *
 * ## Delivery Policy
 * - Each delivery gets a unique UUID (`X-Webhook-Delivery-Id` header)
 * - Signature version is included as `X-Webhook-Signature-Version: v1`
 * - Failed first attempts are marked `pending_retry` for background processing
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

  const deliveries = allWebhooks.map(async (wh) => {
    const deliveryId = crypto.randomUUID();
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', wh.secret)
      .update(payload)
      .digest('hex');

    // Insert delivery record with stored payload for retry worker recovery
    await supabase.from('webhook_deliveries').insert({
      id: deliveryId,
      webhook_id: wh.id,
      event: event.event,
      status: 'pending',
      attempts: 0,
      max_retries: MAX_RETRIES,
      retry_delay_ms: RETRY_DELAY_MS,
      payload: {
        event,
        url: wh.url,
        secret: wh.secret,
        signature,
      },
    });

    // DNS validation at enqueue time (non-retryable)
    const dnsCheck = await resolveAndValidateHost(wh.url);
    if (!dnsCheck.valid) {
      await markDeliveryFailed(supabase, deliveryId, 0);
      await incrementFailure(supabase, wh);
      logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: 'DNS validation failed' }).catch(() => {});
      return;
    }

    // One synchronous attempt inside the request lifecycle
    await supabase.from('webhook_deliveries').update({
      status: 'pending',
      attempts: 1,
    }).eq('id', deliveryId);

    const result = await sendWebhookRequest({
      deliveryId,
      url: wh.url,
      eventName: event.event,
      timestamp: event.timestamp,
      signature,
      payload,
    });

    if (result.ok) {
      await markDeliverySuccess(supabase, deliveryId, result.responseStatus);
      await resetWebhookFailureState(supabase, wh.id);
      logWebhookDelivery('success', wh.id, wh.agent_id, wh.url, { attempts: 1 }).catch(() => {});
      return;
    }

    // First attempt failed — mark for background retry worker
    await supabase.from('webhook_deliveries').update({
      status: 'pending_retry',
      response_status: result.responseStatus || null,
      last_retry_at: null,
    }).eq('id', deliveryId);

    logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, {
      reason: result.reason,
      status: result.responseStatus || undefined,
      attempts: 1,
      queued_for_retry: true,
    }).catch(() => {});
  });

  await Promise.allSettled(deliveries);
}

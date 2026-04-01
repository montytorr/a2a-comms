import crypto from 'crypto';
import { createServerClient } from './supabase/server';
import { resolveAndValidateHost } from './url-validator';
import { logWebhookDelivery, logWebhookDisabled } from './security-events';

interface WebhookEvent {
  event: 'invitation' | 'message' | 'contract_state' | 'approval.requested' | 'approval.approved' | 'approval.denied';
  contract_id?: string;
  approval_id?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Deliver webhooks for an event to all subscribed agents.
 * Fire-and-forget with delivery tracking and error handling.
 *
 * ## Delivery Policy
 * - Each delivery gets a unique UUID (`X-Webhook-Delivery-Id` header)
 * - Signature version is included as `X-Webhook-Signature-Version: v1`
 * - No automatic retries (fire-and-forget)
 * - All deliveries are logged to `webhook_deliveries` table for audit
 * - Webhooks are auto-disabled after 10 consecutive failures
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

  if (!webhooks || webhooks.length === 0) return;

  // Deliver to each webhook in parallel
  const deliveries = webhooks.map(async (wh) => {
    const deliveryId = crypto.randomUUID();
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', wh.secret)
      .update(payload)
      .digest('hex');

    // Create delivery record
    await supabase.from('webhook_deliveries').insert({
      id: deliveryId,
      webhook_id: wh.id,
      event: event.event,
      status: 'pending',
      attempts: 1,
    });

    try {
      // Validate resolved IPs at delivery time (DNS rebinding protection)
      const dnsCheck = await resolveAndValidateHost(wh.url);
      if (!dnsCheck.valid) {
        await markDeliveryFailed(supabase, deliveryId, 0);
        await incrementFailure(supabase, wh);
        logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: 'DNS validation failed' }).catch(() => {});
        return;
      }

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
        signal: AbortSignal.timeout(10000), // 10s timeout
        redirect: 'manual', // Prevent redirect-based SSRF
      });

      // Treat redirects as failures (3xx)
      if (resp.status >= 300 && resp.status < 400) {
        await markDeliveryFailed(supabase, deliveryId, resp.status);
        await incrementFailure(supabase, wh);
        logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: `Redirect ${resp.status}` }).catch(() => {});
        return;
      }

      if (resp.ok) {
        await markDeliverySuccess(supabase, deliveryId, resp.status);
        await supabase
          .from('webhooks')
          .update({ last_delivery_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', wh.id);
        logWebhookDelivery('success', wh.id, wh.agent_id, wh.url).catch(() => {});
      } else {
        await markDeliveryFailed(supabase, deliveryId, resp.status);
        await incrementFailure(supabase, wh);
        logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { status: resp.status }).catch(() => {});
      }
    } catch {
      await markDeliveryFailed(supabase, deliveryId, 0);
      await incrementFailure(supabase, wh);
      logWebhookDelivery('failure', wh.id, wh.agent_id, wh.url, { reason: 'Network error' }).catch(() => {});
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

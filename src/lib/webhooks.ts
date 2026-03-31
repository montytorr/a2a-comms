import crypto from 'crypto';
import { createServerClient } from './supabase/server';
import { resolveAndValidateHost } from './url-validator';

interface WebhookEvent {
  event: 'invitation' | 'message' | 'contract_state';
  contract_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Deliver webhooks for an event to all subscribed agents.
 * Fire-and-forget with error tracking.
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
    const payload = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha256', wh.secret)
      .update(payload)
      .digest('hex');

    try {
      // Validate resolved IPs at delivery time (DNS rebinding protection)
      const dnsCheck = await resolveAndValidateHost(wh.url);
      if (!dnsCheck.valid) {
        await incrementFailure(supabase, wh);
        return;
      }

      const resp = await fetch(wh.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.event,
          'X-Webhook-Timestamp': event.timestamp,
        },
        body: payload,
        signal: AbortSignal.timeout(10000), // 10s timeout
        redirect: 'manual', // Prevent redirect-based SSRF
      });

      // Treat redirects as failures (3xx)
      if (resp.status >= 300 && resp.status < 400) {
        await incrementFailure(supabase, wh);
        return;
      }

      if (resp.ok) {
        await supabase
          .from('webhooks')
          .update({ last_delivery_at: new Date().toISOString(), failure_count: 0 })
          .eq('id', wh.id);
      } else {
        await incrementFailure(supabase, wh);
      }
    } catch {
      await incrementFailure(supabase, wh);
    }
  });

  await Promise.allSettled(deliveries);
}

interface WebhookRecord {
  id: string;
  url: string;
  secret: string;
  failure_count: number;
  is_active: boolean;
}

async function incrementFailure(supabase: ReturnType<typeof createServerClient>, wh: WebhookRecord) {
  const newCount = (wh.failure_count || 0) + 1;
  await supabase
    .from('webhooks')
    .update({
      failure_count: newCount,
      // Auto-disable after 10 consecutive failures
      is_active: newCount < 10,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wh.id);
}

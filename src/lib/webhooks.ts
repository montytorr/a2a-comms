import crypto from 'crypto';
import { createServerClient } from './supabase/server';

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
      });

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

async function incrementFailure(supabase: any, wh: any) {
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

'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';

async function canOperateWebhook(
  webhookId: string,
  user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>,
) {
  const supabase = createServerClient();

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .select('id, agent_id, url, is_active')
    .eq('id', webhookId)
    .maybeSingle();

  if (error || !webhook) return { ok: false, error: 'Webhook not found' } as const;
  if (user.isSuperAdmin) return { ok: true, webhook, supabase } as const;

  const { data: agent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', webhook.agent_id)
    .maybeSingle();

  if (!agent || agent.owner_user_id !== user.id) {
    return { ok: false, error: 'You can only operate webhooks for your own agents' } as const;
  }

  return { ok: true, webhook, supabase } as const;
}

export async function requeueWebhookDelivery(input: {
  deliveryId: string;
  webhookId: string;
  contractId?: string | null;
  taskId?: string | null;
}) {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized');

  const authz = await canOperateWebhook(input.webhookId, user);
  if (!authz.ok) throw new Error(authz.error);

  const { supabase, webhook } = authz;

  const { data: delivery, error: deliveryError } = await supabase
    .from('webhook_deliveries')
    .select('id, webhook_id, status, attempts, max_retries, payload, last_retry_at, response_status, event')
    .eq('id', input.deliveryId)
    .eq('webhook_id', input.webhookId)
    .maybeSingle();

  if (deliveryError || !delivery) throw new Error('Webhook delivery not found');

  const payload = (delivery.payload as { event?: unknown } | null) || null;
  if (!payload?.event) {
    throw new Error('Cannot requeue delivery without a stored event payload');
  }

  if (!webhook.is_active) {
    throw new Error('Cannot requeue while the webhook is disabled');
  }

  if (delivery.status === 'success') {
    throw new Error('Successful deliveries cannot be requeued from the inspector');
  }

  if (delivery.status === 'pending' || delivery.status === 'retrying') {
    throw new Error('Delivery is already in flight');
  }

  const maxRetries = delivery.max_retries ?? 0;
  const exhausted = maxRetries > 0 && delivery.attempts >= maxRetries;
  const retryableStatus = delivery.status === 'failed' || delivery.status === 'pending_retry';

  if (!retryableStatus || exhausted) {
    throw new Error('Only failed or pending-retry deliveries with attempts remaining can be requeued');
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('webhook_deliveries')
    .update({
      status: 'pending_retry',
      last_retry_at: null,
      response_status: null,
    })
    .eq('id', delivery.id)
    .eq('webhook_id', input.webhookId)
    .in('status', ['failed', 'pending_retry']);

  if (updateError) throw new Error(`Failed to requeue delivery: ${updateError.message}`);

  await supabase.from('audit_log').insert({
    actor: user.email || user.displayName,
    action: 'webhook.delivery.requeue',
    resource_type: 'webhook',
    resource_id: input.webhookId,
    details: {
      delivery_id: delivery.id,
      delivery_event: delivery.event,
      previous_status: delivery.status,
      attempts: delivery.attempts,
      max_retries: delivery.max_retries,
      contract_id: input.contractId || null,
      task_id: input.taskId || null,
      webhook_url: webhook.url,
      requested_at: now,
    },
  });

  revalidatePath('/protocol-inspector');
  revalidatePath(`/protocol-inspector?contract=${input.contractId || ''}&task=${input.taskId || ''}`);
  revalidatePath('/webhooks');
  revalidatePath('/webhooks/health');
}

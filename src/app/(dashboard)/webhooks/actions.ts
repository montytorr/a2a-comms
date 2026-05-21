'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { createHmac } from 'crypto';
import { resolveAndValidateHost } from '@/lib/url-validator';
import { validateWebhookUrl } from '@/lib/url-validator';
import { revalidatePath } from 'next/cache';
import { evaluateWebhookManagementAccess } from '@/lib/webhook-trust-policy';

function resolveWebhookManagementActor(
  auth: NonNullable<Awaited<ReturnType<typeof getAuthActorContext>>>,
  webhookAgent: { id?: string | null; trust_tier?: string | null; trust_policy?: unknown } | null,
) {
  if (auth.actingAgentId && webhookAgent?.id && auth.actingAgentId === webhookAgent.id) {
    return {
      trust_tier: auth.trustTier,
      trust_policy: auth.trustPolicy,
    };
  }

  return {
    trust_tier: webhookAgent?.trust_tier,
    trust_policy: webhookAgent?.trust_policy,
  };
}

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  responseTime?: number;
}

export async function testWebhook(webhookId: string): Promise<WebhookTestResult> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) return { success: false, error: 'Not authenticated' };

  const supabase = createServerClient();

  const { data: webhook, error: fetchError } = await supabase
    .from('webhooks')
    .select('id, url, secret, agent_id')
    .eq('id', webhookId)
    .single();

  if (fetchError || !webhook) {
    return { success: false, error: 'Webhook not found' };
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_user_id, trust_tier, trust_policy')
    .eq('id', webhook.agent_id)
    .single();

  if (!user.isSuperAdmin && (!agent || agent.owner_user_id !== user.id)) {
    return { success: false, error: 'You can only test webhooks for your own agents' };
  }

  const trustGate = evaluateWebhookManagementAccess('test', resolveWebhookManagementActor(auth, agent || null));
  if (!trustGate.allowed) {
    return { success: false, error: trustGate.body.error };
  }

  const payload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'Test ping from A2A Comms dashboard' },
  });

  const signature = createHmac('sha256', webhook.secret)
    .update(payload)
    .digest('hex');

  const dnsCheck = await resolveAndValidateHost(webhook.url);
  if (!dnsCheck.valid) {
    return { success: false, error: `URL validation failed: ${dnsCheck.error}` };
  }

  const start = Date.now();

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'test',
        'X-Webhook-ID': `test-${crypto.randomUUID()}`,
        'X-Webhook-Timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    });

    const responseTime = Date.now() - start;

    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        status: response.status,
        statusText: 'Redirect blocked (SSRF protection)',
        responseTime,
      };
    }

    const is2xx = response.status >= 200 && response.status < 300;

    return {
      success: is2xx,
      status: response.status,
      statusText: response.statusText,
      responseTime,
    };
  } catch (err) {
    const responseTime = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message.includes('timeout') ? 'Request timed out (10s)' : message,
      responseTime,
    };
  }
}

export async function updateWebhook(
  webhookId: string,
  updates: { url?: string; events?: string[]; is_active?: boolean }
): Promise<{ error?: string }> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) return { error: 'Not authenticated' };

  const supabase = createServerClient();

  const { data: webhook } = await supabase
    .from('webhooks')
    .select('id, agent_id')
    .eq('id', webhookId)
    .single();

  if (!webhook) return { error: 'Webhook not found' };

  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_user_id, trust_tier, trust_policy')
    .eq('id', webhook.agent_id)
    .single();

  if (!user.isSuperAdmin && (!agent || agent.owner_user_id !== user.id)) {
    return { error: 'You can only edit webhooks for your own agents' };
  }

  const trustGate = evaluateWebhookManagementAccess('update', resolveWebhookManagementActor(auth, agent || null));
  if (!trustGate.allowed) {
    return { error: trustGate.body.error };
  }

  if (updates.url) {
    const urlCheck = validateWebhookUrl(updates.url);
    if (!urlCheck.valid) return { error: urlCheck.error || 'Invalid webhook URL' };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.url !== undefined) patch.url = updates.url;
  if (updates.events !== undefined) patch.events = updates.events;
  if (updates.is_active !== undefined) {
    patch.is_active = updates.is_active;
    if (updates.is_active) patch.failure_count = 0;
  }

  const { error: updateError } = await supabase
    .from('webhooks')
    .update(patch)
    .eq('id', webhookId);

  if (updateError) return { error: updateError.message };

  await supabase.from('audit_log').insert({
    actor: user.id,
    action: 'webhook.update',
    resource_type: 'webhook',
    resource_id: webhookId,
    details: { actor_name: user.displayName, updates },
  });

  revalidatePath('/webhooks');
  return {};
}

export interface WebhookDelivery {
  id: string;
  event: string;
  status: 'pending' | 'pending_retry' | 'success' | 'failed' | 'retrying';
  attempts: number;
  max_retries: number | null;
  retry_delay_ms: number | null;
  last_retry_at: string | null;
  response_status: number | null;
  delivered_at: string | null;
  created_at: string;
}

export async function getDeliveries(webhookId: string): Promise<{ data: WebhookDelivery[]; error?: string }> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) return { data: [], error: 'Not authenticated' };

  const supabase = createServerClient();

  const { data: webhook } = await supabase
    .from('webhooks')
    .select('agent_id')
    .eq('id', webhookId)
    .single();
  if (!webhook) return { data: [], error: 'Webhook not found' };

  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_user_id, trust_tier, trust_policy')
    .eq('id', webhook.agent_id)
    .single();

  if (!user.isSuperAdmin && (!agent || agent.owner_user_id !== user.id)) return { data: [], error: 'Access denied' };

  const trustGate = evaluateWebhookManagementAccess('list', resolveWebhookManagementActor(auth, agent || null));
  if (!trustGate.allowed) return { data: [], error: trustGate.body.error };

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('id, event, status, attempts, max_retries, retry_delay_ms, last_retry_at, response_status, delivered_at, created_at')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return { data: [], error: error.message };
  return { data: (data || []) as WebhookDelivery[] };
}

export async function deleteWebhook(webhookId: string): Promise<{ error?: string }> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) return { error: 'Not authenticated' };

  const supabase = createServerClient();

  const { data: webhook } = await supabase
    .from('webhooks')
    .select('id, agent_id, url')
    .eq('id', webhookId)
    .single();

  if (!webhook) return { error: 'Webhook not found' };

  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_user_id, trust_tier, trust_policy')
    .eq('id', webhook.agent_id)
    .single();
  if (!user.isSuperAdmin && (!agent || agent.owner_user_id !== user.id)) {
    return { error: 'You can only delete webhooks for your own agents' };
  }

  const trustGate = evaluateWebhookManagementAccess('delete', resolveWebhookManagementActor(auth, agent || null));
  if (!trustGate.allowed) {
    return { error: trustGate.body.error };
  }

  const { error: delError } = await supabase
    .from('webhooks')
    .update({ is_active: false, url: '', updated_at: new Date().toISOString() })
    .eq('id', webhookId);

  if (delError) return { error: delError.message };

  await supabase.from('audit_log').insert({
    actor: user.id,
    action: 'webhook.delete',
    resource_type: 'webhook',
    resource_id: webhookId,
    details: { actor_name: user.displayName, url: webhook.url },
  });

  revalidatePath('/webhooks');
  return {};
}

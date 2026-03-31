'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { validateWebhookUrl } from '@/lib/url-validator';

export async function getAgents() {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = createServerClient();
  let query = supabase
    .from('agents')
    .select('id, name, display_name')
    .order('name', { ascending: true });

  // Non-admin: only their agents
  if (!user.isSuperAdmin) {
    query = query.eq('owner_user_id', user.id);
  }

  const { data } = await query;
  return data || [];
}

export async function registerWebhook(params: {
  agentId: string;
  url: string;
  secret: string;
  events: string[];
}): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = createServerClient();

  // Validate agent exists and user owns it (or is admin)
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, owner_user_id')
    .eq('id', params.agentId)
    .single();

  if (!agent) {
    return { error: 'Agent not found' };
  }

  if (!user.isSuperAdmin && agent.owner_user_id !== user.id) {
    return { error: 'You can only register webhooks for your own agents' };
  }

  // SSRF protection: validate webhook URL
  const urlCheck = validateWebhookUrl(params.url);
  if (!urlCheck.valid) {
    return { error: urlCheck.error || 'Invalid webhook URL' };
  }

  // Check for duplicate URL per agent
  const { data: existing } = await supabase
    .from('webhooks')
    .select('id')
    .eq('agent_id', params.agentId)
    .eq('url', params.url)
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'A webhook with this URL already exists for this agent' };
  }

  // Insert webhook
  const { error: insertError } = await supabase
    .from('webhooks')
    .insert({
      agent_id: params.agentId,
      url: params.url,
      secret: params.secret,
      events: params.events,
      is_active: true,
      failure_count: 0,
    });

  if (insertError) {
    return { error: insertError.message };
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName || 'dashboard',
    action: 'webhook.register',
    resource_type: 'webhook',
    details: {
      agent_id: params.agentId,
      agent_name: agent.name,
      url: params.url,
      events: params.events,
    },
  });

  return {};
}

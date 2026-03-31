'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { createHmac } from 'crypto';
import { resolveAndValidateHost } from '@/lib/url-validator';

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  responseTime?: number;
}

export async function testWebhook(webhookId: string): Promise<WebhookTestResult> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const supabase = createServerClient();

  // Fetch webhook with its secret
  const { data: webhook, error: fetchError } = await supabase
    .from('webhooks')
    .select('id, url, secret, agent_id')
    .eq('id', webhookId)
    .single();

  if (fetchError || !webhook) {
    return { success: false, error: 'Webhook not found' };
  }

  // Verify ownership: user must own the agent or be admin
  if (!user.isSuperAdmin) {
    const { data: agent } = await supabase
      .from('agents')
      .select('owner_user_id')
      .eq('id', webhook.agent_id)
      .single();

    if (!agent || agent.owner_user_id !== user.id) {
      return { success: false, error: 'You can only test webhooks for your own agents' };
    }
  }

  const payload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'Test ping from A2A Comms dashboard' },
  });

  // Sign with HMAC-SHA256
  const signature = createHmac('sha256', webhook.secret)
    .update(payload)
    .digest('hex');

  // Validate resolved IPs at delivery time (same as production delivery)
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
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    });

    const responseTime = Date.now() - start;

    // Block redirects (SSRF protection)
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

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { createHmac } from 'crypto';

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
  responseTime?: number;
}

export async function testWebhook(webhookId: string): Promise<WebhookTestResult> {
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

  const payload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'Test ping from A2A Comms dashboard' },
  });

  // Sign with HMAC-SHA256
  const signature = createHmac('sha256', webhook.secret)
    .update(payload)
    .digest('hex');

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
    });

    const responseTime = Date.now() - start;
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

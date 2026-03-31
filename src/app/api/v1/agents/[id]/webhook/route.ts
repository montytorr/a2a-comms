import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/supabase/server';
import { validateWebhookUrl } from '@/lib/url-validator';
import type { ApiError } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Only the agent itself can register webhooks
  if (auth.agent.id !== id) {
    return NextResponse.json(
      { error: 'You can only manage webhooks for your own agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { url: string; secret: string; events?: string[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.url || !parsed.secret) {
    return NextResponse.json(
      { error: 'Missing required fields: url, secret', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Validate URL (SSRF protection)
  const urlCheck = validateWebhookUrl(parsed.url);
  if (!urlCheck.valid) {
    return NextResponse.json(
      { error: urlCheck.error || 'Invalid webhook URL', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const validEvents = ['invitation', 'message', 'contract_state'];
  const events = parsed.events || validEvents;
  const invalidEvents = events.filter(e => !validEvents.includes(e));
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: `Invalid event(s): ${invalidEvents.join(', ')}. Valid: ${validEvents.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: webhook, error } = await supabase
    .from('webhooks')
    .upsert(
      {
        agent_id: id,
        url: parsed.url,
        secret: parsed.secret,
        events,
        is_active: true,
        failure_count: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'agent_id,url' }
    )
    .select('id, agent_id, url, events, is_active, created_at, updated_at, last_delivery_at, failure_count')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to register webhook', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json(webhook, { status: 201 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  if (auth.agent.id !== id) {
    return NextResponse.json(
      { error: 'You can only view webhooks for your own agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();

  const { data: webhooks, error } = await supabase
    .from('webhooks')
    .select('id, agent_id, url, events, is_active, created_at, updated_at, last_delivery_at, failure_count')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch webhooks', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: webhooks || [] });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  if (auth.agent.id !== id) {
    return NextResponse.json(
      { error: 'You can only delete webhooks for your own agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  // Get URL from body or query param
  const url = new URL(req.url);
  let webhookUrl = url.searchParams.get('url');

  if (!webhookUrl && body) {
    try {
      const parsed = JSON.parse(body);
      webhookUrl = parsed.url;
    } catch {
      // ignore
    }
  }

  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'Missing webhook URL in body or query param', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error, count } = await supabase
    .from('webhooks')
    .delete()
    .eq('agent_id', id)
    .eq('url', webhookUrl);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete webhook', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  if (count === 0) {
    return NextResponse.json(
      { error: 'Webhook not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}

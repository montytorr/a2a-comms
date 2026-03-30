import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError, UpdateAgentRequest } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { id } = await params;
  const supabase = createServerClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  return NextResponse.json(agent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  // Authorization: must own this agent record or be admin
  if (auth.agent.id !== id && auth.agent.name !== (process.env.A2A_ADMIN_AGENT || 'admin')) {
    return NextResponse.json(
      { error: 'Not authorized to update this agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: UpdateAgentRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Build update object with only allowed fields
  const updates: Record<string, unknown> = {};
  if (parsed.capabilities !== undefined) updates.capabilities = parsed.capabilities;
  if (parsed.protocols !== undefined) updates.protocols = parsed.protocols;
  if (parsed.max_concurrent_contracts !== undefined) updates.max_concurrent_contracts = parsed.max_concurrent_contracts;
  if (parsed.description !== undefined) updates.description = parsed.description;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  updates.updated_at = new Date().toISOString();

  const supabase = createServerClient();
  const { data: agent, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, created_at, updated_at')
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found or update failed', code: 'DB_ERROR', details: error?.message } satisfies ApiError,
      { status: error ? 500 : 404 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'agent.update',
    resourceType: 'agent',
    resourceId: id,
    details: { updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(agent);
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isAdminAgent, getReservedNames } from '@/lib/admin';
import { createServerClient } from '@/lib/supabase/server';
import type { RegisterAgentRequest, ApiError } from '@/lib/types';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const supabase = createServerClient();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch agents', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: agents });
}

export async function POST(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;

  // Only admin can register agents via API
  if (!isAdminAgent(auth.agent.id, auth.agent.name)) {
    return NextResponse.json(
      { error: 'Only the admin agent can register agents via API', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: RegisterAgentRequest;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.name || !parsed.display_name || !parsed.owner) {
    return NextResponse.json(
      { error: 'Missing required fields: name, display_name, owner', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Reserved names check — defense in depth (supplements admin-only gate above)
  const RESERVED_NAMES = getReservedNames();

  if (RESERVED_NAMES.includes(parsed.name)) {
    return NextResponse.json(
      { error: `Agent name "${parsed.name}" is reserved and cannot be registered`, code: 'RESERVED_NAME' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();

  // Check for duplicate name
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('name', parsed.name)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: `Agent with name "${parsed.name}" already exists`, code: 'DUPLICATE' } satisfies ApiError,
      { status: 409 }
    );
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      name: parsed.name,
      display_name: parsed.display_name,
      owner: parsed.owner,
      description: parsed.description || null,
      capabilities: parsed.capabilities || [],
      protocols: parsed.protocols || ['a2a-comms-v1'],
      max_concurrent_contracts: parsed.max_concurrent_contracts || 10,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create agent', code: 'DB_ERROR', details: error.message } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'agent.register',
    resourceType: 'agent',
    resourceId: agent.id,
    details: { name: parsed.name, owner: parsed.owner },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(agent, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isAdminAgent, getReservedNames } from '@/lib/admin';
import type { RegisterAgentRequest, ApiError } from '@/lib/types';
import { AgentLifecycleError, createAgentWithServiceKey } from '@/lib/agent-lifecycle';

export async function GET(req: NextRequest) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const supabase = createServerClient();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, display_name, owner, description, capabilities, protocols, max_concurrent_contracts, trust_tier, trust_notes, trust_policy, privacy_metadata, created_at, updated_at')
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

  const RESERVED_NAMES = getReservedNames();
  if (parsed.name && RESERVED_NAMES.includes(parsed.name)) {
    return NextResponse.json(
      { error: `Agent name "${parsed.name}" is reserved and cannot be registered`, code: 'RESERVED_NAME' } satisfies ApiError,
      { status: 403 }
    );
  }

  let created;
  try {
    created = await createAgentWithServiceKey({
      ...parsed,
      service_key: {
        human_owner: parsed.owner,
      },
    });
  } catch (error) {
    if (error instanceof AgentLifecycleError) {
      return NextResponse.json(
        { error: error.message, code: error.code } satisfies ApiError,
        { status: error.status }
      );
    }

    throw error;
  }

  const { agent, serviceKey } = created;

  await auditLog({
    actor: auth.agent.name,
    action: 'agent.register',
    resourceType: 'agent',
    resourceId: agent.id,
    details: { name: parsed.name, owner: parsed.owner },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    ...agent,
    service_key: {
      key_id: serviceKey.key_id,
      signing_secret: serviceKey.signing_secret,
      label: serviceKey.label,
    },
  }, { status: 201 });
}

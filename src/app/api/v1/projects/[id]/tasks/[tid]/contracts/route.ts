import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

async function verifyMembership(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id, tid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const supabase = createServerClient();
  const { data: links, error } = await supabase
    .from('task_contracts')
    .select('*, contract:contracts(id, title, status, created_at)')
    .eq('task_id', tid);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch linked contracts', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({ data: links || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, tid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { contract_id: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.contract_id) {
    return NextResponse.json(
      { error: 'Missing required field: contract_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify contract exists
  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('id', parsed.contract_id)
    .single();

  if (!contract) {
    return NextResponse.json(
      { error: 'Contract not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const { data: link, error } = await supabase
    .from('task_contracts')
    .insert({
      task_id: tid,
      contract_id: parsed.contract_id,
    })
    .select('*, contract:contracts(id, title, status)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This contract is already linked to this task', code: 'DUPLICATE' } satisfies ApiError,
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to link contract', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task.contract_link',
    resourceType: 'task',
    resourceId: tid,
    details: { contract_id: parsed.contract_id },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id, tid } = await params;

  const member = await verifyMembership(id, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { contract_id: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.contract_id) {
    return NextResponse.json(
      { error: 'Missing required field: contract_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('task_contracts')
    .delete()
    .eq('task_id', tid)
    .eq('contract_id', parsed.contract_id);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to unlink contract', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task.contract_unlink',
    resourceType: 'task',
    resourceId: tid,
    details: { contract_id: parsed.contract_id },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}

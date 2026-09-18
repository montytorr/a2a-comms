import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { validateContractDescription } from '@/lib/contract-description';
import type { ApiError, Contract } from '@/lib/types';
import { autoCloseIfExpired, enrichContract, getParticipant } from '../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;
  const supabase = createServerClient();

  // Verify agent is a participant
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !contract) {
    return NextResponse.json(
      { error: 'Contract not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const updated = await autoCloseIfExpired(contract as Contract);
  const enriched = await enrichContract(updated);

  return NextResponse.json(enriched);
}

/**
 * Correct a contract's description.
 *
 * Description was write-once: there was no update path at all, so a brief that
 * arrived as an unreadable wall of text stayed one for the life of the
 * contract. Only the description can be changed here - the terms a peer
 * accepted are not editable after the fact.
 *
 * Deliberately allowed on a closed contract. Every description this was
 * written to repair belongs to one, and a closed contract is still read: it is
 * the record of what was agreed. The audit entry keeps the previous text, so
 * editing documents the change rather than erasing it.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;
  const supabase = createServerClient();

  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .single();

  if (!contract) {
    return NextResponse.json(
      { error: 'Contract not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const existing = contract as Contract;
  if (existing.proposer_id !== auth.agent.id) {
    return NextResponse.json(
      {
        error: 'Only the proposer can edit a contract description.',
        code: 'PROPOSER_ONLY',
      } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { description?: unknown };
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'description')) {
    return NextResponse.json(
      {
        error: 'Nothing to update. Send { "description": "<markdown>" }; only the description can be edited.',
        code: 'VALIDATION_ERROR',
      } satisfies ApiError,
      { status: 400 }
    );
  }

  const description = validateContractDescription(parsed.description);
  if (!description.ok) {
    return NextResponse.json(description.body satisfies ApiError, { status: description.status });
  }

  const { data: saved, error: updateErr } = await supabase
    .from('contracts')
    .update({ description: description.value })
    .eq('id', id)
    .select()
    .single();

  if (updateErr || !saved) {
    return NextResponse.json(
      { error: 'Failed to update contract', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'contract.description_updated',
    resourceType: 'contract',
    resourceId: id,
    details: {
      previous_description: existing.description,
      new_description: description.value,
      contract_status: existing.status,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(await enrichContract(saved as Contract));
}

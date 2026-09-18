import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isUuid } from '@/lib/contract-operator-channel';
import {
  acknowledgeContractNotes,
  checkChannelReadAccess,
  checkChannelWriteAccess,
  getOperatorChannel,
} from '@/lib/contract-operator-channel-server';
import type { ApiError, OperatorChannelCounts, OperatorNoteSummary } from '@/lib/types';

interface NotesResponse {
  contract_id: string;
  operator_notes: OperatorNoteSummary[];
  operator_channel: OperatorChannelCounts;
  /** POST only: how many acknowledgements this call actually wrote. */
  acknowledged?: number;
  /** POST only: how many of the requested notes were already acknowledged. */
  already_acknowledged?: number;
}

/**
 * Operator notes on a contract.
 *
 * Read-only to agents by design. A note is a human's standing instruction, and
 * an agent that could write one could put words in an operator's mouth on the
 * one surface the operator has. Humans write them in the dashboard.
 *
 * Notes are not turns and not messages. Reading them costs nothing, they are
 * allowed at any contract status, and they never appear in turn accounting.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id } = await params;

  // Observers included: observing is reading, and a note addressed to the
  // participants of a contract an observer is watching is part of what they
  // are there to watch.
  const refusal = await checkChannelReadAccess(id, auth.agent.id);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  const channel = await getOperatorChannel(id, auth.agent.id);
  return NextResponse.json({
    contract_id: id,
    operator_notes: channel.notes,
    operator_channel: channel.counts,
  } satisfies NotesResponse);
}

/**
 * Acknowledge notes.
 *
 * Advisory: an unacknowledged note is still in force, and nothing refuses a
 * message because of one. What this buys is the operator being able to see
 * whether the instruction landed, which is the difference between leaving a
 * note and knowing it was read.
 *
 * With no body, every live note is acknowledged. `note_ids` acknowledges a
 * subset, and a note id that is not live on this contract is refused rather
 * than quietly skipped - acknowledging something that is not there should not
 * report success.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  let parsed: Record<string, unknown> = {};
  try {
    parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  // Acknowledging is an act on the contract, so observers are excluded on the
  // same line drawn for links and task links: they inspect, they do not record.
  const refusal = await checkChannelWriteAccess(id, auth.agent.id);
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  let noteIds: string[] | null = null;
  if (parsed.note_ids !== undefined) {
    if (!Array.isArray(parsed.note_ids) || !parsed.note_ids.every(isUuid)) {
      return NextResponse.json(
        { error: 'note_ids must be an array of note UUIDs.', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
    noteIds = parsed.note_ids as string[];
  }

  const acked = await acknowledgeContractNotes({ contractId: id, agentId: auth.agent.id, noteIds });
  if (!acked.ok) return NextResponse.json(acked.body, { status: acked.status });

  // Only record an acknowledgement that actually happened. Re-acknowledging a
  // note already acknowledged is success, but it is not an event.
  if (acked.acknowledged > 0) {
    await auditLog({
      actor: auth.agent.name,
      action: 'contract.notes_acknowledged',
      resourceType: 'contract',
      resourceId: id,
      details: { acknowledged: acked.acknowledged, note_ids: noteIds },
      ipAddress: getClientIp(req),
    });
  }

  const channel = await getOperatorChannel(id, auth.agent.id);
  return NextResponse.json({
    contract_id: id,
    operator_notes: channel.notes,
    operator_channel: channel.counts,
    acknowledged: acked.acknowledged,
    already_acknowledged: acked.already,
  } satisfies NotesResponse);
}

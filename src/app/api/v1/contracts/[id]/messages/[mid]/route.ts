import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/db/server';
import type { ApiError, MessageResponse } from '@/lib/types';
import { getParticipant } from '../../../_helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id, mid } = await params;

  // Verify agent is a participant in this contract
  const participant = await getParticipant(id, auth.agent.id);
  if (!participant) {
    return NextResponse.json(
      { error: 'Contract not found or you are not a participant', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const db = createServerClient();

  // Fetch the specific message
  const { data: message, error } = await db
    .from('messages')
    .select('*')
    .eq('id', mid)
    .eq('contract_id', id)
    .single();

  if (error || !message) {
    return NextResponse.json(
      { error: 'Message not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Get sender info
  const { data: sender } = await db
    .from('agents')
    .select('id, name, display_name')
    .eq('id', message.sender_id)
    .single();

  // Get contract for turn info
  const { data: contract } = await db
    .from('contracts')
    .select('max_turns, current_turns')
    .eq('id', id)
    .single();

  // The recorded turn number, falling back to position for any row written
  // before the column existed. See the note in the list route: a positional
  // index is wrong for every message after the first non-turn one.
  let positionalFallback: number | null = null;
  if (message.turn_number === null || message.turn_number === undefined) {
    const { count } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', id)
      .lte('created_at', message.created_at);
    positionalFallback = count || 1;
  }

  const response: MessageResponse = {
    ...message,
    sender: sender || { id: message.sender_id, name: 'unknown', display_name: 'Unknown' },
    turn_number: message.turn_number ?? positionalFallback ?? 1,
    turns_remaining: Math.max(0, (contract?.max_turns ?? 50) - (contract?.current_turns ?? 0)),
  };

  return NextResponse.json(response);
}

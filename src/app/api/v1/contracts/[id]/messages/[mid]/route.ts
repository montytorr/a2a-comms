import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/supabase/server';
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

  const supabase = createServerClient();

  // Fetch the specific message
  const { data: message, error } = await supabase
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
  const { data: sender } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .eq('id', message.sender_id)
    .single();

  // Get contract for turn info
  const { data: contract } = await supabase
    .from('contracts')
    .select('max_turns, current_turns')
    .eq('id', id)
    .single();

  // Calculate turn number (position in message sequence)
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', id)
    .lte('created_at', message.created_at);

  const response: MessageResponse = {
    ...message,
    sender: sender || { id: message.sender_id, name: 'unknown', display_name: 'Unknown' },
    turn_number: count || 1,
    turns_remaining: Math.max(0, (contract?.max_turns ?? 50) - (contract?.current_turns ?? 0)),
  };

  return NextResponse.json(response);
}

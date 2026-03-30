import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/supabase/server';
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

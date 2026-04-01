import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

/**
 * GET /api/v1/agents/:id/card
 * Public endpoint — no auth required.
 * Returns the agent's discovery metadata card.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, display_name, description, capabilities, protocols, max_concurrent_contracts, created_at')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const card = {
    name: agent.name,
    display_name: agent.display_name,
    description: agent.description || `${agent.display_name} agent on A2A Comms`,
    capabilities: agent.capabilities || [],
    protocols: agent.protocols || [],
    auth_schemes: ['hmac-sha256'],
    protocol_version: '1.0',
    webhook_support: true,
    max_concurrent_contracts: agent.max_concurrent_contracts,
    rate_limits: {
      requests_per_minute: 60,
      proposals_per_hour: 10,
      messages_per_hour: 100,
    },
    endpoints: {
      api: '/api/v1',
      health: '/api/v1/health',
      card: `/api/v1/agents/${agent.id}/card`,
    },
    created_at: agent.created_at,
  };

  return NextResponse.json(card, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

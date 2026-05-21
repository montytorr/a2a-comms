import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth-context';

const ACTIVE_AGENT_COOKIE = 'a2a_active_agent';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('agentId' in body)) {
    return NextResponse.json({ error: 'Missing agentId field' }, { status: 400 });
  }

  const rawAgentId = (body as Record<string, unknown>).agentId;
  if (rawAgentId !== null && (typeof rawAgentId !== 'string' || rawAgentId.trim().length === 0)) {
    return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 });
  }

  const agentId = typeof rawAgentId === 'string' ? rawAgentId.trim() : null;

  if (agentId && !user.isSuperAdmin && !user.agentIds.includes(agentId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cookieStore = await cookies();
  if (!agentId) {
    cookieStore.delete(ACTIVE_AGENT_COOKIE);
  } else {
    cookieStore.set(ACTIVE_AGENT_COOKIE, agentId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return NextResponse.json({ ok: true, activeAgentId: agentId });
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthUser } from '@/lib/auth-context';

const ACTIVE_AGENT_COOKIE = 'a2a_active_agent';

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const agentId = typeof body?.agentId === 'string' && body.agentId.trim().length > 0
    ? body.agentId.trim()
    : null;

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

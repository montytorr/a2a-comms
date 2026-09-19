import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';
import { sendEmail, getTemplateNames } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/email/send
 *
 * Internal API — super admin session required.
 * Body: { template: string, to: string, props: Record<string, unknown> }
 */
export async function POST(req: NextRequest) {
  const user = await sessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServerClient();
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const { template, to, props = {} } = body as { template?: string; to?: string; props?: Record<string, unknown> };

  if (!template || typeof template !== 'string') {
    return NextResponse.json({ error: 'template is required' }, { status: 400 });
  }
  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: 'to is required' }, { status: 400 });
  }

  const available = getTemplateNames();
  if (!available.includes(template)) {
    return NextResponse.json(
      { error: `Unknown template. Available: ${available.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await sendEmail(to, template, props);
  if (result.error) {
    const isClientError = /validation|template|invalid|missing/i.test(String(result.error));
    return NextResponse.json({ error: result.error }, { status: isClientError ? 400 : 500 });
  }

  return NextResponse.json({ id: result.id, ok: true });
}

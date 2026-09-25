import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';
import { getTemplateNames } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/email/templates
 * List available email templates — super admin only.
 */
export async function GET() {
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
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  return NextResponse.json({ templates: getTemplateNames() });
}

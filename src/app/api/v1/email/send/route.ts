import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';
import { sendEmail, getTemplateNames } from '@/lib/email';

/**
 * POST /api/v1/email/send
 *
 * Internal API — super admin session required.
 * Body: { template: string, to: string, props: Record<string, unknown> }
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 });
  }

  let body: { template?: string; to?: string; props?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { template, to, props = {} } = body;

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
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, ok: true });
}

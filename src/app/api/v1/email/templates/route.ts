import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';
import { getTemplateNames } from '@/lib/email';

async function authenticate(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  }

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
  if (!user) return false;

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_super_admin === true;
}

/**
 * GET /api/v1/email/templates
 * Returns list of available email template names.
 */
export async function GET(req: NextRequest) {
  if (!(await authenticate(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ templates: getTemplateNames() });
}

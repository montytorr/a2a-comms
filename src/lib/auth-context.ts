import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';

export interface AuthUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  displayName: string;
  agentIds: string[]; // agent IDs owned by this user
}

export async function getAuthUser(): Promise<AuthUser | null> {
  // Create an auth-aware client using cookies
  const cookieStore = await cookies();
  const supabase = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {}, // read-only in server components
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Use service role client for profile + agents lookup
  const adminClient = createServerClient();

  const [profileRes, agentsRes] = await Promise.all([
    adminClient.from('user_profiles').select('*').eq('id', user.id).single(),
    adminClient.from('agents').select('id').eq('owner_user_id', user.id),
  ]);

  return {
    id: user.id,
    email: user.email || '',
    isSuperAdmin: profileRes.data?.is_super_admin || false,
    displayName:
      profileRes.data?.display_name || user.email?.split('@')[0] || 'User',
    agentIds: (agentsRes.data || []).map((a) => a.id),
  };
}

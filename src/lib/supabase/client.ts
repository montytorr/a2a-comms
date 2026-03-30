import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client with cookie-based auth (required for middleware)
export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

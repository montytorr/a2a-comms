import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client with cookie-based auth (required for middleware).
// NEXT_PUBLIC_* variables must be referenced statically so Next.js can inline them
// into the client bundle at build time.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing public Supabase configuration');
  }

  return createSSRBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}

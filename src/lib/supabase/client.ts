import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client with cookie-based auth (required for middleware)
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createBrowserClient() {
  return createSSRBrowserClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );
}

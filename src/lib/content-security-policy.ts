const SUPABASE_ORIGIN = 'https://doqhqukckkkqlihjtqnp.supabase.co';

export function buildContentSecurityPolicy({ frameAncestors = "'none'" }: { frameAncestors?: string } = {}) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`,
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE_ORIGIN} wss://doqhqukckkkqlihjtqnp.supabase.co`,
    `frame-src 'self' ${SUPABASE_ORIGIN}`,
    `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

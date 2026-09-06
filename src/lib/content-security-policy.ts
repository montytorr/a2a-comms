export function buildContentSecurityPolicy({
  frameAncestors = "'none'",
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
}: { frameAncestors?: string; supabaseUrl?: string } = {}) {
  const url = supabaseUrl ? new URL(supabaseUrl) : null;
  if (url && !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Supabase must use HTTP or HTTPS');
  }
  const origin = url ? ` ${url.origin}` : '';
  const websocket = url ? ` ${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${origin}`,
    "font-src 'self'",
    `connect-src 'self'${origin}${websocket}`,
    `frame-src 'self'${origin}`,
    `media-src 'self' blob:${origin}`,
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

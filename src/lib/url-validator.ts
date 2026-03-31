/**
 * Validate a webhook URL to prevent SSRF attacks.
 * Blocks: private IPs, localhost, link-local, multicast, reserved ranges.
 * Requires HTTPS.
 */
export function validateWebhookUrl(urlString: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Must be HTTPS
  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Webhook URL must use HTTPS' };
  }

  const hostname = url.hostname.toLowerCase();

  // Block localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost')
  ) {
    return { valid: false, error: 'Webhook URL cannot target localhost' };
  }

  // Block IP addresses in private/reserved ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return { valid: false, error: 'Webhook URL cannot target private IP ranges' };
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: 'Webhook URL cannot target private IP ranges' };
    // 192.168.0.0/16
    if (a === 192 && b === 168) return { valid: false, error: 'Webhook URL cannot target private IP ranges' };
    // 169.254.0.0/16 link-local
    if (a === 169 && b === 254) return { valid: false, error: 'Webhook URL cannot target link-local addresses' };
    // 127.0.0.0/8 loopback
    if (a === 127) return { valid: false, error: 'Webhook URL cannot target loopback addresses' };
    // 0.0.0.0/8
    if (a === 0) return { valid: false, error: 'Webhook URL cannot target reserved addresses' };
    // 224.0.0.0/4 multicast
    if (a >= 224 && a <= 239) return { valid: false, error: 'Webhook URL cannot target multicast addresses' };
    // 240-255 reserved
    if (a >= 240) return { valid: false, error: 'Webhook URL cannot target reserved addresses' };
  }

  // Block IPv6 private ranges (basic check)
  if (hostname.startsWith('[')) {
    const inner = hostname.slice(1, -1).toLowerCase();
    if (inner.startsWith('fc') || inner.startsWith('fd') || inner.startsWith('fe80')) {
      return { valid: false, error: 'Webhook URL cannot target private IPv6 ranges' };
    }
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { valid: false, error: 'Webhook URL cannot target cloud metadata endpoints' };
  }

  return { valid: true };
}

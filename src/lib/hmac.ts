// NOTE: In-memory storage — SINGLE-INSTANCE ONLY.
// In multi-instance deployments, nonce replay protection and rate limiting
// will NOT work correctly. Replace with Redis or equivalent shared store
// before horizontal scaling. See: https://github.com/montytorr/a2a-comms/issues
import crypto from 'crypto';
import { createServerClient } from './supabase/server';

const TIMESTAMP_TOLERANCE_SECONDS = 300; // ±5 minutes
const MAX_BODY_SIZE = 50 * 1024; // 50KB

// ── Nonce replay protection (in-memory, same pattern as rate-limit.ts) ──

const nonceCache = new Map<string, number>(); // nonce → expiry timestamp (ms)

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of nonceCache) {
    if (expiresAt < now) nonceCache.delete(nonce);
  }
}, 5 * 60 * 1000);

// ── RFC 8785 JSON Canonicalization ──

/**
 * Canonicalize a value per RFC 8785 (JCS):
 *   - Objects: keys sorted lexicographically (recursively)
 *   - No extra whitespace
 *   - Strings, numbers, booleans, null serialized per JSON spec
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`
    );
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(value);
}

export interface HmacValidationResult {
  valid: boolean;
  agentId?: string;
  keyId?: string;
  error?: string;
  code?: string;
}

/**
 * Validate HMAC-signed API request.
 *
 * Expected headers:
 *   X-API-Key: <key_id>        — public identifier
 *   X-Timestamp: <unix_epoch>  — request timestamp
 *   X-Signature: <hex_digest>  — HMAC-SHA256(secret, method\npath\ntimestamp\nnonce\nbody)
 *   X-Nonce: <uuid>            — unique request nonce (required)
 */
/**
 * @warning Uses in-memory nonce cache. Single-instance only.
 * For horizontal scaling, replace nonceCache with Redis.
 */
export async function validateHmac(
  method: string,
  path: string,
  body: string,
  headers: {
    apiKey?: string;
    timestamp?: string;
    signature?: string;
    nonce?: string;
  }
): Promise<HmacValidationResult> {
  const { apiKey, timestamp, signature, nonce } = headers;

  // Check required headers
  if (!apiKey || !timestamp || !signature) {
    return {
      valid: false,
      error: 'Missing required headers: X-API-Key, X-Timestamp, X-Signature',
      code: 'MISSING_HEADERS',
    };
  }

  // Validate timestamp (anti-replay)
  const requestTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > TIMESTAMP_TOLERANCE_SECONDS) {
    return {
      valid: false,
      error: `Timestamp out of tolerance (±${TIMESTAMP_TOLERANCE_SECONDS}s)`,
      code: 'TIMESTAMP_EXPIRED',
    };
  }

  // Nonce replay protection
  if (nonce) {
    if (nonceCache.has(nonce)) {
      return {
        valid: false,
        error: 'Duplicate nonce — possible replay attack',
        code: 'NONCE_REPLAY',
      };
    }
    // Store nonce with TTL matching timestamp tolerance window
    const nonceExpiresAt = Date.now() + TIMESTAMP_TOLERANCE_SECONDS * 1000;
    nonceCache.set(nonce, nonceExpiresAt);
  } else {
    return {
      valid: false,
      error: 'Missing required header: X-Nonce',
      code: 'MISSING_NONCE',
    };
  }

  // Validate body size
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_SIZE) {
    return {
      valid: false,
      error: `Request body exceeds ${MAX_BODY_SIZE / 1024}KB limit`,
      code: 'BODY_TOO_LARGE',
    };
  }

  // Canonicalize the body for signing if it's non-empty JSON
  let canonicalBody = body;
  if (body) {
    try {
      const parsed = JSON.parse(body);
      canonicalBody = canonicalize(parsed);
    } catch {
      // Not JSON — use raw body as-is
      canonicalBody = body;
    }
  }

  // Look up service key
  const supabase = createServerClient();
  const { data: keyData, error: keyError } = await supabase
    .from('service_keys')
    .select('id, key_id, signing_secret, agent_id, is_active, expires_at')
    .eq('key_id', apiKey)
    .single();

  if (keyError || !keyData) {
    return {
      valid: false,
      error: 'Invalid API key',
      code: 'INVALID_KEY',
    };
  }

  if (!keyData.is_active) {
    return {
      valid: false,
      error: 'API key is deactivated',
      code: 'KEY_DEACTIVATED',
    };
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return {
      valid: false,
      error: 'API key has expired',
      code: 'KEY_EXPIRED',
    };
  }

  // Build signing message (nonce is required)
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${canonicalBody}`;

  const expectedSignature = crypto
    .createHmac('sha256', keyData.signing_secret)
    .update(message)
    .digest('hex');

  // Constant-time comparison
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return {
      valid: false,
      error: 'Invalid signature',
      code: 'INVALID_SIGNATURE',
    };
  }

  return {
    valid: true,
    agentId: keyData.agent_id,
    keyId: keyData.key_id,
  };
}

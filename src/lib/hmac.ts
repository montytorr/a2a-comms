// ── Nonce replay protection ──
// Primary: PostgreSQL `nonce_cache` table (shared across instances).
// Fallback: in-memory Map (single-instance only, used when PostgreSQL is unreachable).
// Migration required: supabase/migrations/20260331144800_shared_rate_limit.sql
import crypto from 'crypto';
import { createServerClient } from './supabase/server';
import { logReplayDetected, logInvalidSignature } from './security-events';

const TIMESTAMP_TOLERANCE_SECONDS = 300; // ±5 minutes
const MAX_BODY_SIZE = 50 * 1024; // 50KB

// ── In-memory fallback for nonce replay protection ──
const fallbackNonceCache = new Map<string, number>(); // nonce → expiry timestamp (ms)
let nonceCleanupInterval: NodeJS.Timeout | null = null;

async function runNonceCleanup(): Promise<void> {
  // Clean fallback cache
  const now = Date.now();
  for (const [nonce, expiresAt] of fallbackNonceCache) {
    if (expiresAt < now) fallbackNonceCache.delete(nonce);
  }

  // Also trigger PostgreSQL cleanup
  try {
    const supabase = createServerClient();
    await supabase.rpc('cleanup_expired_nonces');
  } catch {
    // PostgreSQL cleanup failed — fallback cache handles it locally
  }
}

function ensureNonceCleanupInterval(): void {
  if (nonceCleanupInterval) return;

  // Only start the background janitor when HMAC validation is actually used.
  // Leaving a top-level interval on import keeps node:test workers alive.
  nonceCleanupInterval = setInterval(() => {
    void runNonceCleanup();
  }, 5 * 60 * 1000);
  nonceCleanupInterval.unref();
}

/**
 * Check if a nonce has been seen before and record it.
 * Uses shared PostgreSQL storage with an in-memory fallback.
 */
async function checkAndRecordNonce(nonce: string, expiresAtMs: number): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const expiresAt = new Date(expiresAtMs).toISOString();

    // Check existence
    const { data: existing } = await supabase
      .from('nonce_cache')
      .select('nonce')
      .eq('nonce', nonce)
      .maybeSingle();

    if (existing) return true; // duplicate

    // Insert — conflict = duplicate nonce
    const { error: insertError } = await supabase
      .from('nonce_cache')
      .insert({ nonce, expires_at: expiresAt });

    if (insertError) {
      // Unique constraint violation = duplicate nonce
      if (insertError.code === '23505') return true;
      throw insertError;
    }

    return false; // new nonce, recorded
  } catch (err) {
    // PostgreSQL unreachable — fall back to in-memory
    console.warn('[hmac] PostgreSQL nonce check failed, using in-memory fallback:', err);

    if (fallbackNonceCache.has(nonce)) return true;
    fallbackNonceCache.set(nonce, expiresAtMs);
    return false;
  }
}

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
  keyRecordId?: string;
  error?: string;
  code?: string;
}

/**
 * The body a request's signature is computed over.
 *
 * **`multipart/form-data` requests sign an empty body.** `authenticateApiRequest`
 * validates the HMAC *before* parsing the multipart payload, so the parser is
 * never run on unauthenticated input — which means neither the file nor the form
 * fields are covered by the signature. The signature still binds the method,
 * path, timestamp and nonce, so a request cannot be forged or replayed; what it
 * does not do is protect the payload from tampering in flight, which is TLS's
 * job.
 *
 * This used to be ambiguous: a `canonicalizeMultipartFields` helper existed and
 * was unit-tested, but nothing ever called it in the request path. The CLI was
 * written against the design that helper implied and signed the form fields, so
 * every `a2a task-attach` / `contract-attach` failed with 401 — each side
 * self-consistent, both test suites green, the feature entirely broken. The
 * helper is gone so the code states the actual contract.
 *
 * If field integrity is ever wanted, parsing untrusted multipart before
 * authenticating is the cost — change the server, the CLI's `_multipart_encode`
 * and `src/lib/multipart-signing-contract.test.ts` together.
 */
export function deriveSigningBody(body: string): string {
  if (!body) return '';

  try {
    const parsed = JSON.parse(body);
    return canonicalize(parsed);
  } catch {
    return body;
  }
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
 * Validate HMAC-signed API request.
 * Nonce replay protection uses shared PostgreSQL storage (falls back to in-memory).
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
  },
): Promise<HmacValidationResult> {
  ensureNonceCleanupInterval();

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

  // Nonce replay protection (shared via PostgreSQL, in-memory fallback)
  if (nonce) {
    const nonceExpiresAt = Date.now() + TIMESTAMP_TOLERANCE_SECONDS * 1000;
    const isDuplicate = await checkAndRecordNonce(nonce, nonceExpiresAt);
    if (isDuplicate) {
      logReplayDetected(nonce, apiKey).catch(() => {});
      return {
        valid: false,
        error: 'Duplicate nonce — possible replay attack',
        code: 'NONCE_REPLAY',
      };
    }
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

  const canonicalBody = deriveSigningBody(body);

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

  // Canonicalize path: pathname only, no query string, no trailing slash (except root)
  let canonicalPath = path;
  try {
    // Handle full URLs or paths with query strings
    if (path.startsWith('http')) {
      canonicalPath = new URL(path).pathname;
    } else {
      canonicalPath = path.split('?')[0];
    }
  } catch {
    canonicalPath = path.split('?')[0];
  }
  // Normalize trailing slash (keep root "/" as-is)
  if (canonicalPath.length > 1 && canonicalPath.endsWith('/')) {
    canonicalPath = canonicalPath.slice(0, -1);
  }

  // Build signing message (nonce is required)
  const message = `${method}\n${canonicalPath}\n${timestamp}\n${nonce}\n${canonicalBody}`;

  const expectedSignature = crypto
    .createHmac('sha256', keyData.signing_secret)
    .update(message)
    .digest('hex');

  // Constant-time comparison
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    logInvalidSignature(apiKey, undefined, keyData.agent_id).catch(() => {});
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
    keyRecordId: keyData.id,
  };
}

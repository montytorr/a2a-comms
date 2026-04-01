import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase/server';
import type { AuthContext } from './types';

const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const MAX_KEY_LENGTH = 256;

interface IdempotencyResult {
  /** If set, return this cached response immediately. */
  cachedResponse?: NextResponse;
  /** The idempotency key (null if header not provided). */
  key: string | null;
}

/**
 * Check for an existing idempotency key and return cached response if found.
 * Call this at the top of write endpoints.
 *
 * Returns `cachedResponse` if the key was already used.
 * Returns `key` (string | null) for the caller to store after a successful write.
 */
export async function checkIdempotency(
  req: NextRequest,
  auth: AuthContext,
): Promise<IdempotencyResult> {
  const key = req.headers.get(IDEMPOTENCY_HEADER);
  if (!key) return { key: null };

  if (key.length > MAX_KEY_LENGTH) {
    return {
      key: null,
      cachedResponse: NextResponse.json(
        { error: `Idempotency key exceeds ${MAX_KEY_LENGTH} characters`, code: 'VALIDATION_ERROR' },
        { status: 400 },
      ),
    };
  }

  const supabase = createServerClient();

  // Look up existing key
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('status_code, response, expires_at')
    .eq('key', key)
    .eq('agent_id', auth.agent.id)
    .single();

  if (existing) {
    // Check if expired
    if (new Date(existing.expires_at) < new Date()) {
      // Expired — delete and proceed as new
      await supabase
        .from('idempotency_keys')
        .delete()
        .eq('key', key)
        .eq('agent_id', auth.agent.id);
      return { key };
    }

    // Return cached response with idempotency header
    const resp = NextResponse.json(existing.response, { status: existing.status_code });
    resp.headers.set('X-Idempotency-Replay', 'true');
    return { cachedResponse: resp, key };
  }

  return { key };
}

/**
 * Store the response for an idempotency key after a successful write.
 * Only stores if a key was provided in the request.
 */
export async function storeIdempotencyResponse(
  key: string | null,
  auth: AuthContext,
  endpoint: string,
  statusCode: number,
  responseBody: unknown,
): Promise<void> {
  if (!key) return;

  const supabase = createServerClient();

  // Use upsert to handle race conditions gracefully
  await supabase.from('idempotency_keys').upsert(
    {
      key,
      endpoint,
      agent_id: auth.agent.id,
      status_code: statusCode,
      response: responseBody,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'key' },
  );
}

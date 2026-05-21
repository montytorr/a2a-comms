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
  endpoint: string,
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

  // Atomic upsert: try to claim the key with a sentinel response.
  // If another request already claimed it, the upsert returns the existing row.
  const { data: upserted, error: upsertError } = await supabase
    .from('idempotency_keys')
    .upsert(
      {
        key,
        endpoint,
        agent_id: auth.agent.id,
        status_code: 0,
        response: null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'key,agent_id,endpoint', ignoreDuplicates: true },
    )
    .select('status_code, response, expires_at')
    .single();

  // If upsert returned no rows, the key already exists — fetch it
  const existing = upsertError
    ? (await supabase
        .from('idempotency_keys')
        .select('status_code, response, expires_at')
        .eq('key', key)
        .eq('agent_id', auth.agent.id)
        .eq('endpoint', endpoint)
        .single()).data
    : upserted;

  if (existing && existing.status_code !== 0) {
    if (new Date(existing.expires_at) < new Date()) {
      await supabase
        .from('idempotency_keys')
        .delete()
        .eq('key', key)
        .eq('agent_id', auth.agent.id)
        .eq('endpoint', endpoint);
      return { key };
    }

    const resp = NextResponse.json(existing.response, { status: existing.status_code });
    resp.headers.set('X-Idempotency-Replay', 'true');
    return { cachedResponse: resp, key };
  }

  if (existing && existing.status_code === 0 && upsertError) {
    return {
      key: null,
      cachedResponse: NextResponse.json(
        { error: 'Concurrent request in progress for this idempotency key', code: 'CONFLICT' },
        { status: 409 },
      ),
    };
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
    { onConflict: 'key,agent_id,endpoint' },
  );
}

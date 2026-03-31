import { NextRequest, NextResponse } from 'next/server';
import { validateHmac } from './hmac';
import { checkRateLimit, RATE_LIMITS } from './rate-limit';
import { createServerClient } from './supabase/server';
import type { Agent, ApiError, AuthContext } from './types';

/**
 * Full authentication pipeline for API routes.
 * Reads body once, returns auth context + parsed body.
 */
export async function authenticateApiRequest(
  req: NextRequest
): Promise<
  | { auth: AuthContext; body: string; error?: never }
  | { error: NextResponse<ApiError>; auth?: never; body?: never }
> {
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;
  const body = method === 'GET' || method === 'HEAD' ? '' : await req.text();

  // Validate HMAC
  const hmacResult = await validateHmac(method, path, body, {
    apiKey: req.headers.get('x-api-key') || undefined,
    timestamp: req.headers.get('x-timestamp') || undefined,
    signature: req.headers.get('x-signature') || undefined,
    nonce: req.headers.get('x-nonce') || undefined,
  });

  if (!hmacResult.valid) {
    return {
      error: NextResponse.json(
        { error: hmacResult.error!, code: hmacResult.code! },
        { status: 401 }
      ),
    };
  }

  // Check kill switch for write operations
  if (method !== 'GET' && method !== 'HEAD') {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'kill_switch')
      .single();

    if (data?.value?.active === true) {
      return {
        error: NextResponse.json(
          { error: 'System is frozen — kill switch active', code: 'SYSTEM_FROZEN' },
          { status: 503 }
        ),
      };
    }
  }

  // Global rate limit
  const globalLimit = await checkRateLimit(
    `global:${hmacResult.keyId}`,
    RATE_LIMITS.global
  );
  if (!globalLimit.allowed) {
    const headers = new Headers();
    headers.set('X-RateLimit-Remaining', '0');
    headers.set('X-RateLimit-Reset', String(Math.ceil(globalLimit.resetAt / 1000)));
    return {
      error: NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers }
      ),
    };
  }

  // Look up agent
  if (!hmacResult.agentId) {
    return {
      error: NextResponse.json(
        { error: 'Service key not associated with an agent', code: 'NO_AGENT' },
        { status: 403 }
      ),
    };
  }

  const supabase = createServerClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', hmacResult.agentId)
    .single();

  if (!agent) {
    return {
      error: NextResponse.json(
        { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
        { status: 404 }
      ),
    };
  }

  return {
    auth: {
      agent: agent as Agent,
      keyId: hmacResult.keyId!,
    },
    body,
  };
}

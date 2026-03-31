import { NextRequest, NextResponse } from 'next/server';
import { validateHmac } from './hmac';
import { checkRateLimit, RATE_LIMITS } from './rate-limit';
import { createServerClient } from './supabase/server';
import type { Agent, ApiError, AuthContext } from './types';

/**
 * Authenticate an API request via HMAC and return the agent context.
 * Returns either the AuthContext or an error NextResponse.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<{ auth: AuthContext } | { error: NextResponse<ApiError> }> {
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname;
  const body = method === 'GET' || method === 'HEAD' ? '' : await req.text();

  const hmacResult = await validateHmac(method, path, body, {
    apiKey: req.headers.get('x-api-key') || undefined,
    timestamp: req.headers.get('x-timestamp') || undefined,
    signature: req.headers.get('x-signature') || undefined,
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
    const frozen = await isSystemFrozen();
    if (frozen) {
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
    return {
      error: NextResponse.json(
        { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429 }
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
  };
}

/**
 * Check if kill switch is active.
 */
export async function isSystemFrozen(): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'kill_switch')
    .single();

  return data?.value?.active === true;
}

/**
 * Log an action to the audit log.
 */
export async function auditLog(params: {
  actor: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  const supabase = createServerClient();
  await supabase.from('audit_log').insert({
    actor: params.actor,
    action: params.action,
    resource_type: params.resourceType || null,
    resource_id: params.resourceId || null,
    details: params.details || null,
    ip_address: params.ipAddress || null,
  });
}

/**
 * Parse the request body, handling the case where it was already consumed by auth.
 */
export async function parseBody<T>(req: NextRequest): Promise<T | null> {
  try {
    // Clone the request since body may have been consumed
    const text = await req.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * Get client IP from request.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

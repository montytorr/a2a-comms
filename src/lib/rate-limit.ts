// ── Rate Limiting ──
// Primary: Supabase `rate_limit_buckets` table (shared across instances).
// Fallback: in-memory Map (single-instance only, used when Supabase is unreachable).
// Migration required: supabase/migrations/20260331144800_shared_rate_limit.sql

import { createServerClient } from './supabase/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ── In-memory fallback ──
const fallbackBuckets = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes (fallback + Supabase cleanup)
setInterval(async () => {
  const now = Date.now();
  for (const [key, entry] of fallbackBuckets) {
    if (entry.resetAt < now) fallbackBuckets.delete(key);
  }
  try {
    const supabase = createServerClient();
    await supabase.rpc('cleanup_expired_buckets');
  } catch {
    // Supabase cleanup failed — fallback cache handles it locally
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS = {
  global: { windowMs: 60_000, maxRequests: 60 },          // 60/min per key
  proposals: { windowMs: 3_600_000, maxRequests: 10 },    // 10/hour per agent
  messages: { windowMs: 3_600_000, maxRequests: 100 },    // 100/hour per agent
} as const;

/**
 * Check rate limit using Supabase shared storage.
 * Falls back to in-memory if Supabase is unreachable.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const supabase = createServerClient();

    // Use atomic Postgres function for check-and-increment
    const { data, error } = await supabase.rpc('rate_limit_increment', {
      p_key: key,
      p_window_ms: config.windowMs,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('No data returned from rate_limit_increment');

    const newCount: number = row.new_count;
    const resetAt = new Date(row.bucket_reset_at).getTime();

    if (newCount > config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - newCount,
      resetAt,
    };
  } catch (err) {
    // Supabase unreachable — fall back to in-memory
    console.warn('[rate-limit] Supabase rate limit check failed, using in-memory fallback:', err);
    return checkRateLimitFallback(key, config);
  }
}

/** In-memory fallback (single-instance only) */
function checkRateLimitFallback(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  let entry = fallbackBuckets.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    fallbackBuckets.set(key, entry);
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// NOTE: In-memory storage — works for single-instance deployment only.
// For horizontal scaling, replace with Redis or shared store.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt < now) buckets.delete(key);
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

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucketKey = `${key}`;

  let entry = buckets.get(bucketKey);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    buckets.set(bucketKey, entry);
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

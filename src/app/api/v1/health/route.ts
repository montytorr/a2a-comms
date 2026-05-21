import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for unauthenticated health endpoint
const healthHits = new Map<string, { count: number; resetAt: number }>();
const HEALTH_WINDOW_MS = 60_000;
const HEALTH_MAX = 30; // 30/min per IP
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const ensureCleanupTimer = () => {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of healthHits) {
      if (entry.resetAt < now) healthHits.delete(key);
    }
  }, 60_000);
  cleanupTimer.unref();
};

const rateLimitHealth = (ip: string): boolean => {
  ensureCleanupTimer();
  const now = Date.now();
  let entry = healthHits.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + HEALTH_WINDOW_MS };
    healthHits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= HEALTH_MAX;
};

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') || 'shared';

  if (!rateLimitHealth(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

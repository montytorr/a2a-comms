import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Which build is currently being served.
 *
 * Deliberately unauthenticated and as small as a response gets: it is polled by
 * every open tab to notice a deploy, and it must answer even when the session
 * layer is unhappy. It discloses the version, which the dashboard footer and
 * the agent card already publish.
 *
 * This exists because a deploy silently breaks every tab that is already open.
 * Next compares the build id on each RSC fetch and, on a mismatch, calls
 * `location.replace` and then *infinitely suspends the React root* so no child
 * re-renders. If that replace does not land — Traefik mid-switch, the old
 * container already gone — the tab is frozen on painted DOM, its polling timer
 * still firing into a guard that swallows every attempt, and nothing in the page
 * can report it because nothing re-renders. The only escape is a reload the page
 * decides on for itself, and to decide it needs to know the server moved on.
 */
export async function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

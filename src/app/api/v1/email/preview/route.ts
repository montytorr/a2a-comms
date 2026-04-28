import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Email previews with non-persisted payloads were intentionally removed.
 * Re-enable this endpoint only when it can render a persisted email event or a user-supplied preview payload.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Email template preview requires a real persisted payload and is not available yet.' },
    { status: 410 }
  );
}

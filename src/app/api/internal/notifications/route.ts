import { NextResponse } from 'next/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthActorContext();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const summary = await getDashboardNotificationSummary(auth);
    return NextResponse.json({ counts: summary.counts });
  } catch (error) {
    console.error('[notifications]', error);
    return NextResponse.json({ error: 'Notifications unavailable' }, { status: 500 });
  }
}

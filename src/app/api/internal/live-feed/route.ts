import { NextResponse } from 'next/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { getLiveFeedItems } from '@/lib/live-feed';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthActorContext();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ items: await getLiveFeedItems(auth) });
  } catch (error) {
    console.error('[live-feed]', error);
    return NextResponse.json({ error: 'Live feed unavailable' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';

export const dynamic = 'force-dynamic';

type TickerTone = 'mint' | 'amber' | 'rose';

type TickerItem = {
  tone: TickerTone;
  actor: string;
  type: string;
  time: string;
  timestamp: string;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function validTimestamp(value: unknown): string | null {
  const text = stringValue(value);
  return text && !Number.isNaN(new Date(text).getTime()) ? text : null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function toneForEvent(event: string): TickerTone {
  if (/fail|denied|reject|error|invalid/i.test(event)) return 'rose';
  if (/approval|propos|pending|request/i.test(event)) return 'amber';
  return 'mint';
}

function normalize(items: TickerItem[]) {
  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12)
    .map(({ tone, actor, type, time }) => ({ tone, actor, type, time }));
}

export async function GET() {
  const auth = await getAuthActorContext();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServerClient();
  const isAdmin = auth.user.isSuperAdmin;
  const scope = await buildDashboardVisibilityScope(auth);

  const noVisibleScope = !isAdmin
    && scope.webhookIds.length === 0
    && scope.contractActorNames.length === 0;
  if (noVisibleScope) return NextResponse.json({ items: [] });

  let auditQuery = supabase
    .from('audit_log')
    .select('actor, action, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  let deliveriesQuery = supabase
    .from('webhook_deliveries')
    .select('event, status, created_at, delivered_at, webhook_id')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!isAdmin) {
    auditQuery = scope.contractActorNames.length > 0
      ? auditQuery.in('actor', scope.contractActorNames)
      : auditQuery.eq('actor', '__none__');
    deliveriesQuery = scope.webhookIds.length > 0
      ? deliveriesQuery.in('webhook_id', scope.webhookIds)
      : deliveriesQuery.eq('webhook_id', '__none__');
  }

  const [auditRes, deliveriesRes] = await Promise.all([
    auditQuery,
    deliveriesQuery,
  ]);

  const items: TickerItem[] = [];

  for (const row of auditRes.data || []) {
    const timestamp = validTimestamp(row.created_at);
    const action = stringValue(row.action);
    if (!timestamp || !action) continue;

    items.push({
      tone: toneForEvent(action),
      actor: stringValue(row.actor) || 'audit',
      type: action,
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  for (const row of deliveriesRes.data || []) {
    const timestamp = validTimestamp(row.delivered_at) || validTimestamp(row.created_at);
    const event = stringValue(row.event);
    if (!timestamp || !event) continue;

    const status = stringValue(row.status);
    items.push({
      tone: status === 'failed' ? 'rose' : status === 'pending' ? 'amber' : toneForEvent(event),
      actor: 'webhook',
      type: event,
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  return NextResponse.json({ items: normalize(items) });
}

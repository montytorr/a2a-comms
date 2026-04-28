import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';

export const dynamic = 'force-dynamic';

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

type TickerTone = 'mint' | 'peri' | 'amber' | 'rose';

type TickerItem = {
  tone: TickerTone;
  actor: string;
  type: string;
  time: string;
  timestamp: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function toneForAction(action: string): TickerTone {
  if (/fail|denied|reject|error|invalid/i.test(action)) return 'rose';
  if (/approval|propos|pending|request/i.test(action)) return 'amber';
  if (/message|task|project/i.test(action)) return 'peri';
  return 'mint';
}

function label(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalize(items: TickerItem[]) {
  return items
    .filter((item) => !Number.isNaN(new Date(item.timestamp).getTime()))
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
    && scope.contractIds.length === 0
    && scope.webhookIds.length === 0
    && scope.contractActorNames.length === 0;
  if (noVisibleScope) return NextResponse.json({ items: [] });

  let auditQuery = supabase
    .from('audit_log')
    .select('actor, action, created_at')
    .order('created_at', { ascending: false })
    .limit(8);
  let messagesQuery = supabase
    .from('messages')
    .select('created_at, contract_id, sender:agents!messages_sender_id_fkey(name, display_name)')
    .order('created_at', { ascending: false })
    .limit(8);
  let contractsQuery = supabase
    .from('contracts')
    .select('title, status, updated_at, proposer:agents!contracts_proposer_id_fkey(name, display_name)')
    .order('updated_at', { ascending: false })
    .limit(8);
  let deliveriesQuery = supabase
    .from('webhook_deliveries')
    .select('event, status, created_at, delivered_at, webhook_id')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!isAdmin) {
    auditQuery = scope.contractActorNames.length > 0
      ? auditQuery.in('actor', scope.contractActorNames)
      : auditQuery.eq('actor', '__none__');
    messagesQuery = scope.contractIds.length > 0
      ? messagesQuery.in('contract_id', scope.contractIds)
      : messagesQuery.eq('contract_id', EMPTY_UUID);
    contractsQuery = scope.contractIds.length > 0
      ? contractsQuery.in('id', scope.contractIds)
      : contractsQuery.eq('id', EMPTY_UUID);
    deliveriesQuery = scope.webhookIds.length > 0
      ? deliveriesQuery.in('webhook_id', scope.webhookIds)
      : deliveriesQuery.eq('webhook_id', EMPTY_UUID);
  }

  const [auditRes, messagesRes, contractsRes, deliveriesRes] = await Promise.all([
    auditQuery,
    messagesQuery,
    contractsQuery,
    deliveriesQuery,
  ]);

  const items: TickerItem[] = [];

  for (const row of auditRes.data || []) {
    const timestamp = label(row.created_at, new Date().toISOString());
    const action = label(row.action, 'audit.event');
    items.push({
      tone: toneForAction(action),
      actor: label(row.actor, 'system'),
      type: action,
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  for (const row of messagesRes.data || []) {
    const timestamp = label(row.created_at, new Date().toISOString());
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    items.push({
      tone: 'peri',
      actor: label(sender?.display_name || sender?.name, 'agent'),
      type: 'message.created',
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  for (const row of contractsRes.data || []) {
    const timestamp = label(row.updated_at, new Date().toISOString());
    const proposer = Array.isArray(row.proposer) ? row.proposer[0] : row.proposer;
    items.push({
      tone: toneForAction(label(row.status, 'contract.updated')),
      actor: label(proposer?.display_name || proposer?.name, 'agent'),
      type: `contract.${label(row.status, 'updated')}`,
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  for (const row of deliveriesRes.data || []) {
    const timestamp = label(row.delivered_at || row.created_at, new Date().toISOString());
    const status = label(row.status, 'pending');
    items.push({
      tone: status === 'success' ? 'mint' : status === 'failed' ? 'rose' : 'amber',
      actor: 'webhook',
      type: `${label(row.event, 'delivery')}.${status}`,
      time: timeAgo(timestamp),
      timestamp,
    });
  }

  return NextResponse.json({ items: normalize(items) });
}

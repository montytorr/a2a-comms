import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import AnalyticsCharts from './charts';
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const days = Math.min(90, Math.max(7, parseInt(params.days || '14', 10)));
  const supabase = createServerClient();
  noStore();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString();

  // For non-admin, get scoped contract IDs
  let scopedContractIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
    scopedContractIds = (participantContracts || []).map(p => p.contract_id);
  }

  // 1. Contracts by status
  let contractsQuery = supabase.from('contracts').select('id, status');
  if (scopedContractIds !== null) {
    if (scopedContractIds.length > 0) {
      contractsQuery = contractsQuery.in('id', scopedContractIds);
    } else {
      contractsQuery = contractsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }
  const { data: allContracts } = await contractsQuery;

  const contractsByStatus: Record<string, number> = {};
  for (const c of allContracts || []) {
    contractsByStatus[c.status] = (contractsByStatus[c.status] || 0) + 1;
  }

  // 2. Messages per day (last N days)
  let messagesQuery = supabase
    .from('messages')
    .select('id, created_at, sender_id')
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: true });

  if (scopedContractIds !== null) {
    if (scopedContractIds.length > 0) {
      messagesQuery = messagesQuery.in('contract_id', scopedContractIds);
    } else {
      messagesQuery = messagesQuery.eq('contract_id', '00000000-0000-0000-0000-000000000000');
    }
  }
  const { data: recentMessages } = await messagesQuery;

  const messagesPerDay: Record<string, number> = {};
  const agentMessageCount: Record<string, number> = {};

  for (const m of recentMessages || []) {
    const day = m.created_at.slice(0, 10);
    messagesPerDay[day] = (messagesPerDay[day] || 0) + 1;
    agentMessageCount[m.sender_id] = (agentMessageCount[m.sender_id] || 0) + 1;
  }

  // Fill in empty days
  const dayLabels: string[] = [];
  const dayCounts: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key);
    dayCounts.push(messagesPerDay[key] || 0);
  }

  // 3. Per-agent message count — resolve names
  const agentIds = Object.keys(agentMessageCount);
  let agentNameMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await supabase
      .from('agents')
      .select('id, display_name, name')
      .in('id', agentIds);
    for (const a of agents || []) {
      agentNameMap[a.id] = a.display_name || a.name;
    }
  }

  const agentStats = Object.entries(agentMessageCount)
    .map(([id, count]) => ({ name: agentNameMap[id] || id.slice(0, 8), count }))
    .sort((a, b) => b.count - a.count);

  // 4. Average turns per contract
  let turnsQuery = supabase
    .from('contracts')
    .select('current_turns')
    .neq('status', 'proposed');
  if (scopedContractIds !== null) {
    if (scopedContractIds.length > 0) {
      turnsQuery = turnsQuery.in('id', scopedContractIds);
    } else {
      turnsQuery = turnsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }
  const { data: contractTurns } = await turnsQuery;

  let avgTurns = 0;
  if (contractTurns && contractTurns.length > 0) {
    const total = contractTurns.reduce((sum, c) => sum + (c.current_turns || 0), 0);
    avgTurns = Math.round((total / contractTurns.length) * 10) / 10;
  }

  return (
    <AutoRefresh intervalMs={30000}>
    <AnalyticsCharts
      contractsByStatus={contractsByStatus}
      dayLabels={dayLabels}
      dayCounts={dayCounts}
      agentStats={agentStats}
      avgTurns={avgTurns}
      totalContracts={(allContracts || []).length}
      totalMessages={(recentMessages || []).length}
      days={days}
    />
    </AutoRefresh>
  );
}

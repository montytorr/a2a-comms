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
  let scopedProjectIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const safeAgentIds = user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000'];
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', safeAgentIds);
    scopedContractIds = (participantContracts || []).map(p => p.contract_id);

    const { data: memberProjects } = await supabase
      .from('project_members')
      .select('project_id')
      .in('agent_id', safeAgentIds);
    scopedProjectIds = (memberProjects || []).map(p => p.project_id);
  }

  // Helper to apply scope to a query
  const noResultId = '00000000-0000-0000-0000-000000000000';

  // 1. Contracts by status
  let contractsQuery = supabase.from('contracts').select('id, status');
  if (scopedContractIds !== null) {
    contractsQuery = scopedContractIds.length > 0
      ? contractsQuery.in('id', scopedContractIds)
      : contractsQuery.eq('id', noResultId);
  }
  const { data: allContracts } = await contractsQuery;

  const contractsByStatus: Record<string, number> = {};
  for (const c of allContracts || []) {
    contractsByStatus[c.status] = (contractsByStatus[c.status] || 0) + 1;
  }

  // 2. Messages per day (last N days) — also used for hourly heatmap + avg response time
  let messagesQuery = supabase
    .from('messages')
    .select('id, created_at, sender_id, contract_id')
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: true });

  if (scopedContractIds !== null) {
    messagesQuery = scopedContractIds.length > 0
      ? messagesQuery.in('contract_id', scopedContractIds)
      : messagesQuery.eq('contract_id', noResultId);
  }
  const { data: recentMessages } = await messagesQuery;

  const messagesPerDay: Record<string, number> = {};
  const agentMessageCount: Record<string, number> = {};
  const hourlyMessageCounts: number[] = new Array(24).fill(0);
  // Group messages by contract for response time calculation + top contracts
  const messagesByContract: Record<string, { sender_id: string; created_at: string }[]> = {};

  for (const m of recentMessages || []) {
    const day = m.created_at.slice(0, 10);
    messagesPerDay[day] = (messagesPerDay[day] || 0) + 1;
    agentMessageCount[m.sender_id] = (agentMessageCount[m.sender_id] || 0) + 1;

    // Hourly heatmap
    const hour = new Date(m.created_at).getUTCHours();
    hourlyMessageCounts[hour]++;

    // Group by contract
    if (!messagesByContract[m.contract_id]) {
      messagesByContract[m.contract_id] = [];
    }
    messagesByContract[m.contract_id].push({ sender_id: m.sender_id, created_at: m.created_at });
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
    turnsQuery = scopedContractIds.length > 0
      ? turnsQuery.in('id', scopedContractIds)
      : turnsQuery.eq('id', noResultId);
  }
  const { data: contractTurns } = await turnsQuery;

  let avgTurns = 0;
  if (contractTurns && contractTurns.length > 0) {
    const total = contractTurns.reduce((sum, c) => sum + (c.current_turns || 0), 0);
    avgTurns = Math.round((total / contractTurns.length) * 10) / 10;
  }

  // 5. Active Projects count
  let activeProjectsQuery = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (scopedProjectIds !== null) {
    activeProjectsQuery = scopedProjectIds.length > 0
      ? activeProjectsQuery.in('id', scopedProjectIds)
      : activeProjectsQuery.eq('id', noResultId);
  }
  const { data: _apData, count: activeProjectsCount } = await activeProjectsQuery;

  // 6. Tasks Done in time period
  let tasksDoneQuery = supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'done')
    .gte('updated_at', cutoffISO);
  if (scopedProjectIds !== null) {
    tasksDoneQuery = scopedProjectIds.length > 0
      ? tasksDoneQuery.in('project_id', scopedProjectIds)
      : tasksDoneQuery.eq('project_id', noResultId);
  }
  const { count: tasksDoneCount } = await tasksDoneQuery;

  // 7. Avg Response Time — compute from messages
  let totalResponseTimeMs = 0;
  let responseTimePairs = 0;
  for (const msgs of Object.values(messagesByContract)) {
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].sender_id !== msgs[i - 1].sender_id) {
        const diff = new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime();
        totalResponseTimeMs += diff;
        responseTimePairs++;
      }
    }
  }
  const avgResponseTimeHours = responseTimePairs > 0
    ? Math.round((totalResponseTimeMs / responseTimePairs / 3600000) * 10) / 10
    : null;

  // 8. Webhooks Fired — audit_log entries with 'webhook' in action
  let webhooksFiredQuery = supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .ilike('action', '%webhook%')
    .gte('created_at', cutoffISO);
  const { count: webhooksFiredCount } = await webhooksFiredQuery;

  // 9. Contracts Created per Day
  let contractsCreatedQuery = supabase
    .from('contracts')
    .select('id, created_at')
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: true });
  if (scopedContractIds !== null) {
    contractsCreatedQuery = scopedContractIds.length > 0
      ? contractsCreatedQuery.in('id', scopedContractIds)
      : contractsCreatedQuery.eq('id', noResultId);
  }
  const { data: contractsCreated } = await contractsCreatedQuery;

  const contractsPerDay: Record<string, number> = {};
  for (const c of contractsCreated || []) {
    const day = c.created_at.slice(0, 10);
    contractsPerDay[day] = (contractsPerDay[day] || 0) + 1;
  }
  const contractDayCounts: number[] = dayLabels.map(label => contractsPerDay[label] || 0);

  // 10. Task Status Distribution
  let taskStatusQuery = supabase.from('tasks').select('id, status');
  if (scopedProjectIds !== null) {
    taskStatusQuery = scopedProjectIds.length > 0
      ? taskStatusQuery.in('project_id', scopedProjectIds)
      : taskStatusQuery.eq('project_id', noResultId);
  }
  const { data: allTasks } = await taskStatusQuery;

  const tasksByStatus: Record<string, number> = {};
  for (const t of allTasks || []) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
  }

  // 11. Top Contracts by Messages — top 5
  const contractMessageCounts = Object.entries(messagesByContract)
    .map(([contractId, msgs]) => ({ contractId, count: msgs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Resolve contract titles
  let topContractsByMessages: { title: string; count: number }[] = [];
  if (contractMessageCounts.length > 0) {
    const topIds = contractMessageCounts.map(c => c.contractId);
    const { data: topContracts } = await supabase
      .from('contracts')
      .select('id, title')
      .in('id', topIds);
    const titleMap: Record<string, string> = {};
    for (const c of topContracts || []) {
      titleMap[c.id] = c.title;
    }
    topContractsByMessages = contractMessageCounts.map(c => ({
      title: titleMap[c.contractId] || c.contractId.slice(0, 8),
      count: c.count,
    }));
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
      activeProjects={activeProjectsCount || 0}
      tasksDone={tasksDoneCount || 0}
      avgResponseTimeHours={avgResponseTimeHours}
      webhooksFired={webhooksFiredCount || 0}
      contractDayCounts={contractDayCounts}
      tasksByStatus={tasksByStatus}
      topContractsByMessages={topContractsByMessages}
      hourlyMessageCounts={hourlyMessageCounts}
    />
    </AutoRefresh>
  );
}

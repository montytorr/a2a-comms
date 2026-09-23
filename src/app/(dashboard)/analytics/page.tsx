import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import AnalyticsCharts from './charts';
import {
  deriveContractStats,
  deriveTaskStats,
  countActiveProjects,
  toDaySeries,
} from '@/lib/analytics-derive';
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const params = await searchParams;
  const parsedDays = parseInt(params.days || '14', 10);
  const days = Math.min(90, Math.max(7, Number.isFinite(parsedDays) ? parsedDays : 14));
  const db = createServerClient();
  noStore();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString();

  // For non-admin, get scoped contract IDs
  let scopedContractIds: string[] | null = null;
  let scopedProjectIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const safeAgentIds = auth.agentScope;
    const [participantResult, projectResult] = await Promise.all([db
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', safeAgentIds), db
      .from('project_members')
      .select('project_id')
      .in('agent_id', safeAgentIds)]);
    scopedContractIds = (participantResult.data || []).map(p => p.contract_id);
    scopedProjectIds = (projectResult.data || []).map(p => p.project_id);
  }

  // Helper to apply scope to a query
  const noResultId = '00000000-0000-0000-0000-000000000000';

  // 1. Contracts created in the window. One query feeds the status donut, the
  // per-day bars and avg turns — before, those were three separate queries and
  // only the per-day one was actually windowed.
  let contractsQuery = db
    .from('contracts')
    .select('id, status, created_at, current_turns')
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: true });
  if (scopedContractIds !== null) {
    contractsQuery = scopedContractIds.length > 0
      ? contractsQuery.in('id', scopedContractIds)
      : contractsQuery.eq('id', noResultId);
  }
  // Start independent database reads together.
  const contractsPromise = Promise.resolve(contractsQuery);

  // 2. Messages per day (last N days) — also used for hourly heatmap + avg response time
  let messagesQuery = db
    .from('messages')
    .select('id, created_at, sender_id, contract_id')
    .gte('created_at', cutoffISO)
    .order('created_at', { ascending: true });

  if (scopedContractIds !== null) {
    messagesQuery = scopedContractIds.length > 0
      ? messagesQuery.in('contract_id', scopedContractIds)
      : messagesQuery.eq('contract_id', noResultId);
  }
  const messagesPromise = Promise.resolve(messagesQuery);

  let activeProjectsQuery = db.from('projects').select('id').eq('status', 'active');
  if (scopedProjectIds !== null) {
    activeProjectsQuery = scopedProjectIds.length > 0
      ? activeProjectsQuery.in('id', scopedProjectIds)
      : activeProjectsQuery.eq('id', noResultId);
  }
  let taskStatusQuery = db.from('tasks').select('id, status, project_id').gte('updated_at', cutoffISO);
  if (scopedProjectIds !== null) {
    taskStatusQuery = scopedProjectIds.length > 0
      ? taskStatusQuery.in('project_id', scopedProjectIds)
      : taskStatusQuery.eq('project_id', noResultId);
  }
  let allTimeTasksQuery = db.from('tasks').select('id', { count: 'exact', head: true });
  if (scopedProjectIds !== null) {
    allTimeTasksQuery = scopedProjectIds.length > 0
      ? allTimeTasksQuery.in('project_id', scopedProjectIds)
      : allTimeTasksQuery.eq('project_id', noResultId);
  }
  let allTimeContractsQuery = db.from('contracts').select('id', { count: 'exact', head: true });
  if (scopedContractIds !== null) {
    allTimeContractsQuery = scopedContractIds.length > 0
      ? allTimeContractsQuery.in('id', scopedContractIds)
      : allTimeContractsQuery.eq('id', noResultId);
  }
  const [contractResult, messageResult, projectResult, taskResult, allTimeTaskResult, allTimeContractResult] = await Promise.all([
    contractsPromise, messagesPromise, activeProjectsQuery, taskStatusQuery, allTimeTasksQuery, allTimeContractsQuery,
  ]);
  const allContracts = contractResult.data;
  const recentMessages = messageResult.data;
  const activeProjectRows = projectResult.data;
  const allTasks = taskResult.data;
  const allTimeTaskCount = allTimeTaskResult.count;
  const allTimeContractCount = allTimeContractResult.count;
  const contractStats = deriveContractStats(allContracts || []);
  const contractsByStatus = contractStats.byStatus;
  const avgTurns = contractStats.avgTurns;

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
  const agentNameMap: Record<string, string> = {};
  if (agentIds.length > 0) {
    const { data: agents } = await db
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

  // 5. Projects that are currently active. Fetched as ids rather than a count so
  // they can be intersected with the projects that actually saw task activity in
  // the window — `projects.updated_at` only moves when the project row itself is
  // edited, so it is useless as an activity signal.
  const activeProjectIds = new Set((activeProjectRows || []).map((p) => p.id));

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

  // 8. Webhooks Fired — audit_log entries with 'webhook' in action (scoped for non-admin)
  let webhooksFiredQuery = db
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .ilike('action', '%webhook%')
    .gte('created_at', cutoffISO);
  if (!user.isSuperAdmin) {
    const allWebhookAgentIds = new Set(auth.agentScope);
    const ownAgentIds = [...allWebhookAgentIds];
    const safeOwnAgentIds = ownAgentIds.length > 0 ? ownAgentIds : ['00000000-0000-0000-0000-000000000000'];
    const { data: agentNamesData } = await db
      .from('agents')
      .select('name')
      .in('id', safeOwnAgentIds);
    const agentNames = (agentNamesData || []).map(a => a.name);
    if (agentNames.length > 0) {
      webhooksFiredQuery = webhooksFiredQuery.in('actor', agentNames);
    } else {
      webhooksFiredQuery = webhooksFiredQuery.eq('actor', '__none__');
    }
  }
  const { count: webhooksFiredCount } = await webhooksFiredQuery;

  // 9. Contracts Created per Day — counted in the single pass above
  const contractDayCounts = toDaySeries(contractStats.perDay, dayLabels);

  // 10. Tasks touched in the window. Windowed on updated_at rather than created_at
  // so the donut's "done" slice is exactly the Tasks Done card above it — there is
  // no NOT NULL completion timestamp on tasks to key off instead.

  const taskStats = deriveTaskStats(allTasks || []);
  const tasksByStatus = taskStats.byStatus;
  const tasksDoneCount = taskStats.doneCount;
  // "Active" means active *and* worked on during the window.
  const activeProjectsCount = countActiveProjects(activeProjectIds, taskStats.projectIds);

  // 11. All-time totals. Shown only in the empty states, so that a window with no
  // activity says "nothing happened lately" rather than implying nothing exists.

  // 12. Top Contracts by Messages — top 5
  const contractMessageCounts = Object.entries(messagesByContract)
    .map(([contractId, msgs]) => ({ contractId, count: msgs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Resolve contract titles
  let topContractsByMessages: { title: string; count: number }[] = [];
  if (contractMessageCounts.length > 0) {
    const topIds = contractMessageCounts.map(c => c.contractId);
    const { data: topContracts } = await db
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
    <AutoRefresh intervalMs={30000} watch={['contracts', 'messages', 'tasks', 'projects', 'agents']}>
    <AnalyticsCharts
      contractsByStatus={contractsByStatus}
      dayLabels={dayLabels}
      dayCounts={dayCounts}
      agentStats={agentStats}
      avgTurns={avgTurns}
      totalContracts={contractStats.total}
      totalMessages={(recentMessages || []).length}
      days={days}
      activeProjects={activeProjectsCount}
      tasksDone={tasksDoneCount}
      avgResponseTimeHours={avgResponseTimeHours}
      webhooksFired={webhooksFiredCount || 0}
      contractDayCounts={contractDayCounts}
      tasksByStatus={tasksByStatus}
      topContractsByMessages={topContractsByMessages}
      hourlyMessageCounts={hourlyMessageCounts}
      allTimeTasks={allTimeTaskCount || 0}
      allTimeContracts={allTimeContractCount || 0}
    />
    </AutoRefresh>
  );
}

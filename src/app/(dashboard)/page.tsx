import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { redirect } from 'next/navigation';
import { buildDashboardVisibilityScope } from '@/lib/dashboard-scope';
import type { Contract, SystemConfig } from '@/lib/types';
import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const supabase = createServerClient();
  noStore();

  const isAdmin = user.isSuperAdmin;
  const scope = await buildDashboardVisibilityScope(auth);
  const agentIds = scope.agentIds;

  let contractsQuery = supabase
    .from('contracts')
    .select('id, status')
    .eq('status', 'active');

  let pendingQuery = supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed');

  let messagesQuery = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  let auditQuery = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(12);

  let scopedProjectIds: string[] | null = null;

  if (!isAdmin && agentIds.length > 0) {
    const contractIds = scope.contractIds;
    scopedProjectIds = scope.projectIds;

    if (contractIds.length > 0) {
      contractsQuery = supabase
        .from('contracts')
        .select('id, status')
        .eq('status', 'active')
        .in('id', contractIds);
      pendingQuery = supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'proposed')
        .in('id', contractIds);
      messagesQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .in('contract_id', contractIds);
    } else {
      const none = '00000000-0000-0000-0000-000000000000';
      contractsQuery = supabase.from('contracts').select('id, status').eq('status', 'active').eq('id', none);
      pendingQuery = supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'proposed').eq('id', none);
      messagesQuery = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('contract_id', none);
    }

    const names = scope.contractActorNames;
    if (names.length > 0) {
      auditQuery = auditQuery.in('actor', names);
    }
  } else if (!isAdmin && agentIds.length === 0) {
    scopedProjectIds = [];
    const none = '00000000-0000-0000-0000-000000000000';
    contractsQuery = supabase.from('contracts').select('id, status').eq('id', none);
    pendingQuery = supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('id', none);
    messagesQuery = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('contract_id', none);
    auditQuery = supabase.from('audit_log').select('*').eq('actor', '__none__').limit(12);
  }

  const agentsCountQuery = supabase.from('agents').select('id', { count: 'exact', head: true });

  let activeProjectsQuery = supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (scopedProjectIds !== null) {
    if (scopedProjectIds.length > 0) {
      activeProjectsQuery = activeProjectsQuery.in('id', scopedProjectIds);
    } else {
      activeProjectsQuery = activeProjectsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  let tasksInProgressQuery = supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in-progress');
  if (scopedProjectIds !== null) {
    if (scopedProjectIds.length > 0) {
      tasksInProgressQuery = tasksInProgressQuery.in('project_id', scopedProjectIds);
    } else {
      tasksInProgressQuery = tasksInProgressQuery.eq('project_id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const twentyFourHoursAgo = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
  let webhookDeliveriesQuery = supabase
    .from('webhooks')
    .select('id', { count: 'exact', head: true })
    .gte('last_delivery_at', twentyFourHoursAgo);
  let latestWebhookDeliveryQuery = supabase
    .from('webhooks')
    .select('last_delivery_at')
    .not('last_delivery_at', 'is', null)
    .order('last_delivery_at', { ascending: false })
    .limit(1);
  if (!isAdmin && scope.webhookIds.length > 0) {
    webhookDeliveriesQuery = webhookDeliveriesQuery.in('id', scope.webhookIds);
    latestWebhookDeliveryQuery = latestWebhookDeliveryQuery.in('id', scope.webhookIds);
  } else if (!isAdmin) {
    webhookDeliveriesQuery = webhookDeliveriesQuery.eq('agent_id', '00000000-0000-0000-0000-000000000000');
    latestWebhookDeliveryQuery = latestWebhookDeliveryQuery.eq('agent_id', '00000000-0000-0000-0000-000000000000');
  }

  const [
    contractsRes,
    messagesRes,
    configRes,
    auditRes,
    pendingRes,
    agentsCountRes,
    activeProjectsRes,
    tasksInProgressRes,
    webhookDeliveriesRes,
    latestWebhookDeliveryRes,
  ] = await Promise.all([
    contractsQuery,
    messagesQuery,
    supabase.from('system_config').select('*').eq('key', 'kill_switch').single(),
    auditQuery,
    pendingQuery,
    agentsCountQuery,
    activeProjectsQuery,
    tasksInProgressQuery,
    webhookDeliveriesQuery,
    latestWebhookDeliveryQuery,
  ]);

  const activeContracts = ((contractsRes.data as Contract[] | null) || []).length;
  const messagesToday = messagesRes.count || 0;
  const pendingInvitations = pendingRes.count || 0;
  const killSwitch = configRes.data as SystemConfig | null;
  const isKillSwitchActive = (killSwitch?.value as Record<string, unknown>)?.active === true;
  const recentAudit = auditRes.data || [];
  const totalAgents = agentsCountRes.count || 0;
  const activeProjects = activeProjectsRes.count || 0;
  const tasksInProgress = tasksInProgressRes.count || 0;
  const webhookDeliveries = webhookDeliveriesRes.count || 0;
  const latestWebhookDeliveryAt = latestWebhookDeliveryRes.data?.[0]?.last_delivery_at ?? null;

  return (
    <DashboardClient
      activeContracts={activeContracts}
      messagesToday={messagesToday}
      pendingInvitations={pendingInvitations}
      isKillSwitchActive={isKillSwitchActive}
      totalAgents={totalAgents}
      activeProjects={activeProjects}
      tasksInProgress={tasksInProgress}
      webhookDeliveries={webhookDeliveries}
      recentAudit={recentAudit}
      latestWebhookDeliveryAt={latestWebhookDeliveryAt}
    />
  );
}

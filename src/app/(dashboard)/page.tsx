import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/status-badge';
import AutoRefresh from '@/components/auto-refresh';
import type { AuditLogEntry, Contract, SystemConfig } from '@/lib/types';
export const dynamic = 'force-dynamic';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getActionIcon(action: string) {
  if (action.includes('propose')) return '📋';
  if (action.includes('accept')) return '✅';
  if (action.includes('reject')) return '❌';
  if (action.includes('close')) return '🔒';
  if (action.includes('message') || action.includes('send')) return '💬';
  if (action.includes('kill')) return '⚡';
  if (action.includes('project')) return '📁';
  if (action.includes('task')) return '✏️';
  if (action.includes('webhook')) return '🔗';
  if (action.includes('agent') || action.includes('register')) return '🤖';
  return '•';
}

function getAuditLink(entry: AuditLogEntry): string | null {
  if (!entry.resource_id && !entry.resource_type) return null;
  switch (entry.resource_type) {
    case 'contract': return entry.resource_id ? `/contracts/${entry.resource_id}` : null;
    case 'project': return entry.resource_id ? `/projects/${entry.resource_id}` : null;
    case 'agent': return entry.resource_id ? `/agents/${entry.resource_id}` : null;
    case 'task': return '/projects';
    case 'message': return '/messages';
    case 'system': return '/kill-switch';
    default: return null;
  }
}

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  // Build scoped queries
  const isAdmin = user.isSuperAdmin;
  const agentIds = user.agentIds;

  // Active contracts — scoped by user's agents as participant
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
    .limit(10);

  // Scoped project/task queries for non-admin
  let scopedProjectIds: string[] | null = null;

  if (!isAdmin && agentIds.length > 0) {
    // For contracts, we need to check contract_participants for the user's agents
    // Get contract IDs where user's agents are participants
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', agentIds);
    const contractIds = (participantContracts || []).map(p => p.contract_id);

    // Get project IDs where user's agents are members
    const { data: memberProjects } = await supabase
      .from('project_members')
      .select('project_id')
      .in('agent_id', agentIds);
    scopedProjectIds = (memberProjects || []).map(p => p.project_id);

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
      // No contracts at all for this user
      contractsQuery = supabase
        .from('contracts')
        .select('id, status')
        .eq('status', 'active')
        .eq('id', '00000000-0000-0000-0000-000000000000'); // no results
      pendingQuery = supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'proposed')
        .eq('id', '00000000-0000-0000-0000-000000000000');
      messagesQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('contract_id', '00000000-0000-0000-0000-000000000000');
    }

    // Scope audit to user's agent names
    const { data: agentNames } = await supabase
      .from('agents')
      .select('name')
      .in('id', agentIds);
    const names = (agentNames || []).map(a => a.name);
    if (names.length > 0) {
      auditQuery = auditQuery.in('actor', names);
    }
  } else if (!isAdmin && agentIds.length === 0) {
    // No agents — show nothing
    scopedProjectIds = [];
    contractsQuery = supabase
      .from('contracts')
      .select('id, status')
      .eq('id', '00000000-0000-0000-0000-000000000000');
    pendingQuery = supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('id', '00000000-0000-0000-0000-000000000000');
    messagesQuery = supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', '00000000-0000-0000-0000-000000000000');
    auditQuery = supabase
      .from('audit_log')
      .select('*')
      .eq('actor', '__none__')
      .limit(10);
  }

  // Build second-row stat queries
  // Total Agents — always global (public info)
  const agentsCountQuery = supabase
    .from('agents')
    .select('id', { count: 'exact', head: true });

  // Active Projects — scoped for non-admin
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

  // Tasks In Progress — scoped via project
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

  // Webhook Deliveries (24h) — scoped for non-admin
  const twentyFourHoursAgo = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
  let webhookDeliveriesQuery = supabase
    .from('webhooks')
    .select('id', { count: 'exact', head: true })
    .gte('last_delivery_at', twentyFourHoursAgo);
  if (!isAdmin && agentIds.length > 0) {
    webhookDeliveriesQuery = webhookDeliveriesQuery.in('agent_id', agentIds);
  } else if (!isAdmin) {
    webhookDeliveriesQuery = webhookDeliveriesQuery.eq('agent_id', '00000000-0000-0000-0000-000000000000');
  }

  const [contractsRes, messagesRes, configRes, auditRes, pendingRes, agentsCountRes, activeProjectsRes, tasksInProgressRes, webhookDeliveriesRes] = await Promise.all([
    contractsQuery,
    messagesQuery,
    supabase
      .from('system_config')
      .select('*')
      .eq('key', 'kill_switch')
      .single(),
    auditQuery,
    pendingQuery,
    agentsCountQuery,
    activeProjectsQuery,
    tasksInProgressQuery,
    webhookDeliveriesQuery,
  ]);

  const activeContracts = (contractsRes.data as Contract[] | null) || [];
  const messagesToday = messagesRes.count || 0;
  const pendingInvitations = pendingRes.count || 0;
  const killSwitch = configRes.data as SystemConfig | null;
  const isKillSwitchActive = (killSwitch?.value as Record<string, unknown>)?.active === true;
  const recentAudit = (auditRes.data as AuditLogEntry[] | null) || [];
  const totalAgents = agentsCountRes.count || 0;
  const activeProjects = activeProjectsRes.count || 0;
  const tasksInProgress = tasksInProgressRes.count || 0;
  const webhookDeliveries = webhookDeliveriesRes.count || 0;

  return (
    <AutoRefresh intervalMs={15000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="mb-10 animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Overview</p>
        <h1 className="text-[32px] font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">
          {isAdmin ? 'System overview and recent activity' : `${user.displayName}'s overview`}
        </p>
      </div>

      {/* Stats Grid — Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Active Contracts */}
        <Link
          href="/contracts?status=active"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.06] to-blue-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Active Contracts</p>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-cyan-400 tracking-tighter leading-none animate-data-shimmer">
              {activeContracts.length}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View all contracts →</p>
          </div>
        </Link>

        {/* Messages Today */}
        <Link
          href="/contracts"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.06] to-purple-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Messages Today</p>
              <div className="w-8 h-8 rounded-lg bg-violet-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-violet-400 tracking-tighter leading-none animate-data-shimmer">
              {messagesToday}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View messages →</p>
          </div>
        </Link>

        {/* System Status */}
        <Link
          href="/kill-switch"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${
            isKillSwitchActive
              ? 'from-red-500/[0.08] to-red-600/[0.04]'
              : 'from-emerald-500/[0.06] to-green-600/[0.03]'
          } opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />
          <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${
            isKillSwitchActive ? 'via-red-500/20' : 'via-emerald-500/20'
          } to-transparent`} />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">System Status</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isKillSwitchActive ? 'bg-red-500/[0.08]' : 'bg-emerald-500/[0.08]'
              }`}>
                {isKillSwitchActive ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                    <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="flex h-3 w-3 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-30 ${
                    isKillSwitchActive ? 'bg-red-400' : 'bg-emerald-400'
                  }`} />
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${
                    isKillSwitchActive ? 'bg-red-400' : 'bg-emerald-400'
                  }`} />
                </span>
              </div>
              <p className={`text-xl font-bold tracking-tight ${
                isKillSwitchActive ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {isKillSwitchActive ? 'Kill Switch Active' : 'Operational'}
              </p>
            </div>
            <p className="text-[11px] text-gray-600 mt-3 group-hover:text-gray-400 transition-colors">
              {isKillSwitchActive ? 'All operations frozen' : 'All systems nominal'}
            </p>
          </div>
        </Link>

        {/* Pending Invitations */}
        <Link
          href="/contracts?status=proposed"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.06] to-amber-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Pending Invitations</p>
              <div className="w-8 h-8 rounded-lg bg-orange-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-orange-400 tracking-tighter leading-none animate-data-shimmer">
              {pendingInvitations}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">Review invitations →</p>
          </div>
        </Link>
      </div>

      {/* Stats Grid — Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {/* Total Agents */}
        <Link
          href="/agents"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/[0.06] to-rose-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-pink-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Total Agents</p>
              <div className="w-8 h-8 rounded-lg bg-pink-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-pink-400">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-pink-400 tracking-tighter leading-none animate-data-shimmer">
              {totalAgents}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View all agents →</p>
          </div>
        </Link>

        {/* Active Projects */}
        <Link
          href="/projects"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.06] to-teal-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Active Projects</p>
              <div className="w-8 h-8 rounded-lg bg-teal-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-400">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-teal-400 tracking-tighter leading-none animate-data-shimmer">
              {activeProjects}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View projects →</p>
          </div>
        </Link>

        {/* Tasks In Progress */}
        <Link
          href="/projects"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.06] to-indigo-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Tasks In Progress</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-indigo-400 tracking-tighter leading-none animate-data-shimmer">
              {tasksInProgress}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View tasks →</p>
          </div>
        </Link>

        {/* Webhook Deliveries (24h) */}
        <Link
          href="/webhooks"
          className="group relative rounded-2xl glass-card-hover overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] to-yellow-600/[0.03] opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em]">Webhooks (24h)</p>
              <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-[42px] font-bold text-amber-400 tracking-tighter leading-none animate-data-shimmer">
              {webhookDeliveries}
            </p>
            <p className="text-[11px] text-gray-600 mt-2 group-hover:text-gray-400 transition-colors">View webhooks →</p>
          </div>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.15s' }}>
        <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-gray-300 tracking-tight">Recent Activity</h2>
            <p className="text-[10px] text-gray-600 mt-0.5">Latest system events</p>
          </div>
          <Link href="/audit" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors font-medium">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {recentAudit.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <p className="text-sm text-gray-600 font-medium">No activity yet</p>
              <p className="text-[11px] text-gray-700 mt-1">Events will appear here as they happen</p>
            </div>
          ) : (
            recentAudit.map((entry, idx) => {
              const linkHref = getAuditLink(entry);
              const inner = (
                <>
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center mr-3">
                    <span className="text-sm">{getActionIcon(entry.action)}</span>
                    {idx < recentAudit.length - 1 && (
                      <div className="w-px h-full bg-gradient-to-b from-white/[0.06] to-transparent mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-cyan-400">{entry.actor}</span>
                      <span className="text-[12px] text-gray-500">{entry.action}</span>
                      {entry.resource_type && (
                        <StatusBadge status={entry.resource_type} variant="message" />
                      )}
                    </div>
                    {entry.resource_id && (
                      <p className="text-[10px] text-gray-700 mt-0.5 font-mono truncate group-hover:text-gray-500 transition-colors">
                        {entry.resource_id}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-600 whitespace-nowrap font-mono tabular-nums">
                      {timeAgo(entry.created_at)}
                    </span>
                    {linkHref && (
                      <svg className="w-3 h-3 text-gray-700 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </>
              );
              const rowClassName = "px-6 py-3 flex items-start gap-0 hover:bg-white/[0.015] transition-all duration-200 group cursor-pointer";
              return linkHref ? (
                <Link key={entry.id} href={linkHref} className={rowClassName}>
                  {inner}
                </Link>
              ) : (
                <div key={entry.id} className={rowClassName}>
                  {inner}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}

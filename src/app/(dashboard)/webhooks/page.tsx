import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import type { Webhook, Agent } from '@/lib/types';
import WebhookCard from './webhook-card';
import AutoRefresh from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';

type WebhookWithAgent = Webhook & { agents: Pick<Agent, 'id' | 'name' | 'display_name'> };

export default async function WebhooksPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  let query = supabase
    .from('webhooks')
    .select(`
      id,
      agent_id,
      url,
      events,
      is_active,
      failure_count,
      created_at,
      updated_at,
      last_delivery_at,
      agents!inner(id, name, display_name)
    `)
    .order('created_at', { ascending: true });

  // Non-admin: only show webhooks for their agents
  if (!user.isSuperAdmin) {
    query = query.in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data: webhooks } = await query;

  const rows = (webhooks || []) as unknown as WebhookWithAgent[];

  // Group by agent
  const grouped = new Map<string, { agent: Pick<Agent, 'id' | 'name' | 'display_name'>; webhooks: WebhookWithAgent[] }>();
  for (const wh of rows) {
    const agentId = wh.agent_id;
    if (!grouped.has(agentId)) {
      grouped.set(agentId, { agent: wh.agents, webhooks: [] });
    }
    grouped.get(agentId)!.webhooks.push(wh);
  }

  return (
    <AutoRefresh intervalMs={30000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 animate-fade-in">
        <div>
          <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Push Notifications</p>
          <h1 className="text-[32px] font-bold text-white tracking-tight">Webhooks</h1>
          <p className="text-sm text-gray-600 mt-1">Push notification endpoints</p>
        </div>
        <Link
          href="/webhooks/register"
          className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/15 hover:bg-cyan-500/[0.12] hover:border-cyan-500/25 transition-all duration-200 flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Register Webhook
        </Link>
      </div>

      {/* Content */}
      {rows.length === 0 ? (
        <div className="rounded-2xl glass-card px-6 py-20 text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 font-medium">No webhooks configured</p>
          <p className="text-[11px] text-gray-700 mt-1">
            Register webhooks via the CLI:{' '}
            <code className="text-cyan-500/70 bg-cyan-500/[0.06] px-1.5 py-0.5 rounded text-[10px] font-mono">
              a2a webhook set --url &lt;url&gt; --secret &lt;s&gt;
            </code>
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([agentId, group], groupIdx) => (
            <div key={agentId} className="animate-fade-in" style={{ animationDelay: `${groupIdx * 0.08}s` }}>
              {/* Agent section header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
                  <span className="text-[8px] font-bold text-white">
                    {(group.agent.display_name || group.agent.name).split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-white tracking-tight">{group.agent.display_name || group.agent.name}</h2>
                  <span className="text-[10px] font-mono text-gray-600">{group.agent.name}</span>
                </div>
                <span className="ml-auto text-[10px] text-gray-700 font-mono bg-white/[0.02] px-2 py-0.5 rounded-md border border-white/[0.03]">
                  {group.webhooks.length} webhook{group.webhooks.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Webhook cards */}
              <div className="grid grid-cols-1 gap-3">
                {group.webhooks.map((wh, idx) => (
                  <WebhookCard
                    key={wh.id}
                    webhook={wh}
                    animationDelay={`${(groupIdx * 0.08) + (idx * 0.04)}s`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </AutoRefresh>
  );
}

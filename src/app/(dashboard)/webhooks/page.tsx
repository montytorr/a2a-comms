import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import type { Webhook, Agent } from '@/lib/types';
import WebhookCard from './webhook-card';
import AutoRefresh from '@/components/auto-refresh';
import { Activity, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

type WebhookWithAgent = Webhook & { agents: Pick<Agent, 'id' | 'name' | 'display_name'> };

export default async function WebhooksPage() {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

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
    query = query.in('agent_id', auth.agentScope);
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
      <div style={{ padding: '28px 32px 60px' }}>
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <p className="upper" style={{ marginBottom: 6 }}>Push Notifications</p>
            <h1 className="h1">Webhooks</h1>
            <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>Push notification endpoints</p>
          </div>
          <div className="row gap-2">
            <Link href="/webhooks/health" className="btn">
              <Activity size={14} />
              Health
            </Link>
            <Link href="/webhooks/register" className="btn btn--primary">
              <Plus size={14} />
              Register Webhook
            </Link>
          </div>
        </div>

        {/* Content */}
        {rows.length === 0 ? (
          <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--bg-2)',
              border: '1px solid var(--line-1)',
              marginBottom: 16,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--fg-4)' }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p style={{ fontSize: 13, color: 'var(--fg-3)', fontWeight: 500 }}>No webhooks configured</p>
            <p style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 6 }}>
              Register webhooks via the CLI:{' '}
              <code className="mono" style={{
                color: 'var(--amber)',
                background: 'var(--amber-bg)',
                padding: '1px 6px',
                borderRadius: 4,
                fontSize: 11,
              }}>
                a2a webhook set --url &lt;url&gt; --secret &lt;s&gt;
              </code>
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {Array.from(grouped.entries()).map(([agentId, group], groupIdx) => (
              <div key={agentId} className="animate-fade-in" style={{ animationDelay: `${groupIdx * 0.08}s` }}>
                {/* Agent section header */}
                <div className="row gap-3" style={{ marginBottom: 12 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--peri-bg)',
                    border: '1px solid var(--line-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--peri)', fontFamily: 'var(--mono)' }}>
                      {(group.agent.display_name || group.agent.name).split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h2 className="h3">{group.agent.display_name || group.agent.name}</h2>
                    <span className="mono dim" style={{ fontSize: 11 }}>{group.agent.name}</span>
                  </div>
                  <span className="mono dim" style={{
                    marginLeft: 'auto',
                    fontSize: 11,
                    background: 'var(--bg-2)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--line-1)',
                  }}>
                    {group.webhooks.length} webhook{group.webhooks.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Webhook cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

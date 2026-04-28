import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Filter, Plus } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { Avatar, KV, SectionHeader, PageFrame } from '@/components/atoms';
import { TRUST_TIER_LABELS, normalizeAgentTrustTier } from '@/lib/trust-tiers';
import { formatDate } from '@/lib/format-date';

export const dynamic = 'force-dynamic';

type AgentRow = {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  owner: string | null;
  capabilities: string[] | null;
  protocols: string[] | null;
  trust_tier: string | null;
  created_at: string | null;
  max_concurrent_contracts: number | null;
};

const trustTierPillClass: Record<string, string> = {
  internal: 'pill pill--mint',
  partner: 'pill pill--peri',
  external: 'pill pill--ghost',
  unknown: 'pill pill--ghost',
};

export default async function AgentsPage({ searchParams }: { searchParams?: Promise<{ tier?: string }> }) {
  const auth = await getAuthActorContext();
  if (!auth?.user) redirect('/login?redirect=/agents');

  const params = await searchParams;
  const activeTier = params?.tier || 'all';
  const supabase = createServerClient();
  noStore();

  let query = supabase
    .from('agents')
    .select('id, name, display_name, description, owner, capabilities, protocols, trust_tier, created_at, max_concurrent_contracts')
    .order('name');

  if (activeTier !== 'all') query = query.eq('trust_tier', activeTier);

  const { data } = await query;
  const agents = (data || []) as AgentRow[];

  return (
    <PageFrame>
      <SectionHeader
        eyebrow="Registry"
        title="Agents"
        sub={`Registered agent identities · ${agents.length} visible`}
        right={
          <>
            <Link className="btn btn--ghost btn--sm btn--icon" href="/agents">
              <Filter size={14} />
            </Link>
            <Link className="btn btn--primary btn--sm row gap-2" href="/agents/register">
              <Plus size={13} />
              Register Agent
            </Link>
          </>
        }
      />

      <div className="seg" style={{ marginBottom: 20 }}>
        {(['all', 'internal', 'partner', 'external'] as const).map((tier) => (
          <Link
            key={tier}
            href={tier === 'all' ? '/agents' : `/agents?tier=${tier}`}
            className={activeTier === tier ? 'active' : ''}
            style={{ textDecoration: 'none' }}
          >
            {tier.charAt(0).toUpperCase() + tier.slice(1)}
          </Link>
        ))}
      </div>

      {agents.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div className="h3">No registered agents</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
            Agents will appear here after they register or are created by an administrator.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </PageFrame>
  );
}

function AgentCard({ agent }: { agent: AgentRow }) {
  const name = agent.display_name || agent.name;
  const trustTier = normalizeAgentTrustTier(agent.trust_tier);
  const capabilities = agent.capabilities || [];
  const protocols = agent.protocols || [];

  return (
    <Link href={`/agents/${agent.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{ padding: 22, height: '100%' }}>
        <div className="row gap-2" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
          <Avatar name={name} size={40} />
          <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-2">
              <span className="h3 truncate-text">{name}</span>
              <span className={trustTierPillClass[trustTier] || 'pill pill--ghost'}>{TRUST_TIER_LABELS[trustTier]}</span>
            </div>
            <span className="dim mono" style={{ fontSize: 12 }}>{agent.name}</span>
          </div>
        </div>

        {agent.description ? (
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
            {agent.description}
          </p>
        ) : (
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14, fontStyle: 'italic' }}>
            No description recorded.
          </p>
        )}

        <div className="col gap-1" style={{ marginBottom: 12 }}>
          <div className="upper">Capabilities</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
            {capabilities.length > 0 ? capabilities.map((cap) => (
              <span key={cap} className="pill pill--ghost">{cap}</span>
            )) : <span className="dim" style={{ fontSize: 12 }}>None recorded</span>}
          </div>
        </div>

        <div className="col gap-1" style={{ marginBottom: 14 }}>
          <div className="upper">Protocols</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
            {protocols.length > 0 ? protocols.map((proto) => (
              <span key={proto} className="pill pill--peri mono">{proto}</span>
            )) : <span className="dim" style={{ fontSize: 12 }}>None recorded</span>}
          </div>
        </div>

        <div className="card card--inset" style={{ padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            <KV label="Owner">
              <span className="mono">{agent.owner || '—'}</span>
            </KV>
            <KV label="Max contracts">
              <span className="mono">{agent.max_concurrent_contracts ?? '—'}</span>
            </KV>
            <KV label="Created">
              <span className="mono">{agent.created_at ? formatDate(agent.created_at) : '—'}</span>
            </KV>
          </div>
        </div>
      </div>
    </Link>
  );
}

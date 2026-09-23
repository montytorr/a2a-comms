import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, AlertTriangle, Bot, ArrowUpRight } from 'lucide-react';
import { createServerClient } from '@/lib/db/server';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { Avatar, SectionHeader, PageFrame, EmptyState } from '@/components/atoms';
import { TRUST_TIER_LABELS, normalizeAgentTrustTier } from '@/lib/trust-tiers';
import { formatDate } from '@/lib/format-date';
import styles from './agents-list.module.css';

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
  const db = createServerClient();
  noStore();

  let query = db
    .from('agents')
    .select('id, name, display_name, description, owner, capabilities, protocols, trust_tier, created_at, max_concurrent_contracts')
    .order('name');

  if (activeTier !== 'all') query = query.eq('trust_tier', activeTier);

  const { data, error: queryError } = await query;
  if (queryError) {
    return (
      <PageFrame>
        <SectionHeader eyebrow="Registry" title="Agents" sub="Failed to load agents" />
        <div className="card">
          <EmptyState
            tone="error"
            icon={<AlertTriangle size={20} />}
            title="Failed to load agents"
            hint="A database error occurred. The registry is not empty — it could not be read. Please try again later."
          />
        </div>
      </PageFrame>
    );
  }
  const agents = (data || []) as AgentRow[];

  return (
    <PageFrame>
      <SectionHeader
        eyebrow="Registry"
        title="Agents"
        sub={`Registered agent identities · ${agents.length} visible`}
        right={
          <Link className="btn btn--primary btn--sm row gap-2" href="/agents/register">
            <Plus size={13} /> Register Agent
          </Link>
        }
      />

      <div className="seg" style={{ marginBottom: 20 }} aria-label="Filter agents by trust tier">
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
        <div className="card">
          <EmptyState
            icon={<Bot size={20} />}
            title="No registered agents"
            hint="Agents appear here once they register or an administrator creates them."
            action={
              <Link className="btn btn--primary btn--sm row gap-2" href="/agents/register">
                <Plus size={13} />
                Register Agent
              </Link>
            }
          />
        </div>
      ) : (
        <div className={styles.list}>
          {agents.map((agent) => (
            <AgentItem key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </PageFrame>
  );
}

function AgentItem({ agent }: { agent: AgentRow }) {
  const name = agent.display_name || agent.name;
  const trustTier = normalizeAgentTrustTier(agent.trust_tier);
  const capabilities = agent.capabilities || [];
  return (
    <Link href={`/agents/${agent.id}`} className={styles.item}>
      <Avatar name={name} size={40} />
      <div className={styles.identity}>
        <div className={styles.nameLine}>
          <strong>{name}</strong>
          <span className={trustTierPillClass[trustTier] || 'pill pill--ghost'}>{TRUST_TIER_LABELS[trustTier]}</span>
        </div>
        <span className={styles.handle}>{agent.name}</span>
      </div>
      <div className={styles.description}>{agent.description || 'No description recorded.'}</div>
      <div className={styles.capabilities}>
        {capabilities.length > 0 ? capabilities.slice(0, 3).map((cap) => (
          <span key={cap} className="pill pill--ghost">{cap}</span>
        )) : <span className={styles.empty}>No capabilities</span>}
        {capabilities.length > 3 && <span className={styles.more}>+{capabilities.length - 3}</span>}
      </div>
      <div className={styles.secondary}>
        <span>{agent.owner || 'Unassigned owner'}</span>
        <span className={styles.date}>{agent.created_at ? formatDate(agent.created_at) : '—'}</span>
      </div>
      <ArrowUpRight size={16} className={styles.arrow} aria-hidden="true" />
    </Link>
  );
}

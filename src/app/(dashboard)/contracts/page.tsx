import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import type { Contract, ContractStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import ContractFilters from './filters';
import ContractRow from './contract-row';
import { formatDate } from '@/lib/format-date';
import { Avatar } from '@/components/atoms';
import { getLinkedTasksForContracts } from '@/lib/contract-task-link';
import { describeContractLink, getRelatedContractsForContracts } from '@/lib/contract-links';
import { FolderGit2, GitBranch, Link2Off } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ContractWithRelations extends Contract {
  proposer: { name: string; display_name: string } | null;
  contract_participants: Array<{
    agent: { name: string; display_name: string } | null;
    role: string;
    status: string;
  }>;
}

const statusTone: Record<string, string> = {
  proposed: 'amber',
  active: 'amber',
  completed: 'mint',
  closed: 'ghost',
  expired: 'rose',
  rejected: 'rose',
};

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; sort?: string }>;
}) {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) redirect('/login');

  const params = await searchParams;
  const statusFilter = (params.status || 'all') as ContractStatus | 'all';
  const searchFilter = params.search || '';
  const sortFilter = params.sort || 'newest';
  const supabase = createServerClient();
  noStore();

  let scopedContractIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', auth.agentScope);
    scopedContractIds = (participantContracts || []).map(p => p.contract_id);
  }

  let query = supabase
    .from('contracts')
    .select(`
      *,
      proposer:agents!contracts_proposer_id_fkey(name, display_name),
      contract_participants(
        agent:agents(name, display_name),
        role,
        status
      )
    `);

  if (scopedContractIds !== null) {
    if (scopedContractIds.length > 0) {
      query = query.in('id', scopedContractIds);
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  if (searchFilter) {
    query = query.ilike('title', `%${searchFilter}%`);
  }

  if (sortFilter === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (sortFilter === 'most-turns') {
    query = query.order('current_turns', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: contracts } = await query;
  const rows = (contracts || []) as ContractWithRelations[];
  // One query for the whole page rather than one per row.
  const linkedTasks = await getLinkedTasksForContracts(rows.map((r) => r.id));
  const relatedContracts = await getRelatedContractsForContracts(rows.map((r) => r.id));

  return (
    <AutoRefresh intervalMs={15000}>
      <div className="mx-auto w-full max-w-[var(--content-max)] px-4 pt-6 pb-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div className="col gap-1">
            <div className="upper">Communication</div>
            <div className="h1">Contracts</div>
            <div className="muted text-sm">
              <span className="num">{rows.length}</span> contract{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <ContractFilters current={statusFilter} />

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden', marginTop: 16 }}>
          {/* Header row */}
          <div className="row text-2xs" style={{
            padding: '8px 18px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--line-1)',
            fontFamily: 'var(--mono)',
            
            color: 'var(--fg-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            <span style={{ width: '30%' }}>Title · Project</span>
            <span style={{ width: '15%' }}>Proposer</span>
            <span style={{ width: '20%' }}>Participants</span>
            <span style={{ width: '10%' }}>Status</span>
            <span style={{ width: '10%' }}>Turns</span>
            <span style={{ width: '15%', textAlign: 'right' }}>Created</span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="h3" style={{ marginTop: 14 }}>No contracts found</div>
              <div className="dim text-sm" style={{ marginTop: 4 }}>Try adjusting your filters</div>
            </div>
          ) : (
            rows.map((contract, i) => {
              const proposerName = contract.proposer?.display_name || contract.proposer?.name || '—';
              const participants = (contract.contract_participants || [])
                .map((p) => {
                  const label = p.agent?.display_name || p.agent?.name;
                  if (!label) return null;
                  return { name: label, role: p.role, status: p.status };
                })
                .filter(Boolean);
              const tone = statusTone[contract.status] || 'ghost';
              const linked = linkedTasks.get(contract.id);
              const related = relatedContracts.get(contract.id) || [];

              return (
                <ContractRow key={contract.id} id={contract.id}>
                  <div className="row text-xs" style={{
                    padding: '10px 18px',
                    borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--line-1)',
                    alignItems: 'center',
                    
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    width: '100%',
                  }}>
                    <span style={{ width: '30%', minWidth: 0, paddingRight: 12 }}>
                      <span style={{ display: 'block', color: 'var(--fg-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {contract.title}
                      </span>
                      {/* The project this contract tracks work in. Shown even when
                          absent, because an unlinked contract has no board and no
                          execution tracking — the gap is the point. */}
                      <span
                        className="row gap-1 text-2xs"
                        style={{
                          marginTop: 3,
                          alignItems: 'center',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          color: linked ? 'var(--fg-3)' : 'var(--amber)',
                        }}
                      >
                        {linked ? <FolderGit2 size={12} style={{ flexShrink: 0 }} /> : <Link2Off size={12} style={{ flexShrink: 0 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {linked
                            ? `${linked.project_title || 'Project'} › ${linked.task_title || 'Task'}`
                            : 'No project — not tracked on any board'}
                        </span>
                      </span>
                      {/* A contract that succeeds, replaces or delegated to
                          another is half of a chain, and the chain is the part
                          a reader cannot reconstruct from this row alone. */}
                      {related.length > 0 && (
                        <span
                          className="row gap-1 text-2xs"
                          style={{
                            marginTop: 3,
                            alignItems: 'center',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            color: 'var(--peri)',
                          }}
                        >
                          <GitBranch size={12} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {describeContractLink(related[0].link_type, related[0].direction)} {related[0].title}
                            {related.length > 1 ? ` +${related.length - 1}` : ''}
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="mono" style={{ width: '15%', color: 'var(--fg-2)' }}>{proposerName}</span>
                    <span style={{ width: '20%' }}>
                      <div className="row gap-1">
                        {participants.slice(0, 3).map((p, j) => (
                          <Avatar key={j} name={p!.name} size={20} />
                        ))}
                        {participants.length > 3 && (
                          <span className="dim mono text-2xs">+{participants.length - 3}</span>
                        )}
                      </div>
                    </span>
                    <span style={{ width: '10%' }}>
                      <span className={`pill pill--${tone} text-2xs`} style={{ height: 18}}>
                        <span className={`dot dot--${tone}`} style={{ width: 4, height: 4 }} />
                        {contract.status}
                      </span>
                    </span>
                    <span className="mono num" style={{ width: '10%', color: 'var(--fg-1)' }}>
                      {contract.current_turns}/{contract.max_turns}
                    </span>
                    <span className="mono dim num text-2xs" style={{ width: '15%', textAlign: 'right' }}>
                      {formatDate(contract.created_at)}
                    </span>
                  </div>
                </ContractRow>
              );
            })
          )}
        </div>
      </div>
    </AutoRefresh>
  );
}

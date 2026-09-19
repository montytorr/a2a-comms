import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import type { Contract, ContractStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import ContractFilters from './filters';
import ContractRow from './contract-row';
import StatusBadge from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { Avatar } from '@/components/atoms';
import { getLinkedTasksForContracts } from '@/lib/contract-task-link';
import { describeContractLink, getRelatedContractsForContracts } from '@/lib/contract-links';
import { getOperatorChannelForContracts } from '@/lib/contract-operator-channel-server';
import { deriveContractTurnState } from '@/lib/contract-turn-state';
import { getLastMessages } from '@/app/api/v1/contracts/_helpers';
import { CornerUpLeft, FolderGit2, GitBranch, Link2Off } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ContractWithRelations extends Contract {
  proposer: { name: string; display_name: string } | null;
  contract_participants: Array<{
    agent: { id: string; name: string; display_name: string } | null;
    role: string;
    status: string;
  }>;
}

/**
 * How long a live contract has left, or null when the question does not apply.
 *
 * Only `proposed` and `active` contracts can still expire; on anything else an
 * `expires_at` in the past is history, not a deadline. "Soon" is under a day,
 * which is the point at which an operator can still do something about it.
 */
function describeExpiry(status: string, expiresAt: string | null): { label: string; soon: boolean; at: string } | null {
  if (!expiresAt || !['proposed', 'active'].includes(status)) return null;

  const msLeft = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(msLeft)) return null;
  if (msLeft <= 0) return { label: 'overdue', soon: true, at: expiresAt };

  const hours = msLeft / 3_600_000;
  if (hours < 1) return { label: `${Math.max(1, Math.round(msLeft / 60_000))}m left`, soon: true, at: expiresAt };
  if (hours < 24) return { label: `${Math.round(hours)}h left`, soon: true, at: expiresAt };
  return { label: `${Math.round(hours / 24)}d left`, soon: false, at: expiresAt };
}

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
        agent:agents(id, name, display_name),
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
  // An agent that has stopped to ask a person is the most actionable thing on
  // this page, and it was only visible by opening each contract in turn.
  const channels = await getOperatorChannelForContracts(rows.map((r) => r.id), null);
  // One query for the page, same as the links above.
  const lastMessages = await getLastMessages(rows.map((r) => r.id));

  return (
    <AutoRefresh intervalMs={15000} watch={['contracts', 'participants', 'messages']}>
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
              const linked = linkedTasks.get(contract.id);
              const related = relatedContracts.get(contract.id) || [];
              const expiry = describeExpiry(contract.status, contract.expires_at);
              const viewerAgentId =
                contract.contract_participants.find((p) => p.agent?.id && auth.agentScope.includes(p.agent.id))
                  ?.agent?.id ?? null;
              const turnState = viewerAgentId
                ? deriveContractTurnState({
                    contract,
                    viewerAgentId,
                    participants: contract.contract_participants.map((p) => ({
                      agent_id: p.agent?.id ?? '',
                      role: p.role as 'proposer' | 'invitee' | 'observer',
                      status: p.status as 'pending' | 'accepted' | 'rejected',
                      name: p.agent?.display_name || p.agent?.name || null,
                    })),
                    lastMessage: lastMessages.get(contract.id) ?? null,
                  })
                : null;

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
                      <span className="row gap-2" style={{ alignItems: 'center', minWidth: 0 }}>
                        <span style={{ color: 'var(--fg-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contract.title}
                        </span>
                        {/* The one thing a list of contracts could never tell
                            you: which of them are waiting on you. */}
                        {turnState?.awaiting === 'you' && (
                          <StatusBadge
                            status="your move"
                            tone="amber"
                            dot="none"
                            style={{ flexShrink: 0 }}
                            title={turnState.reason}
                            label={<><CornerUpLeft size={10} />your move</>}
                          />
                        )}
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
                    <span style={{ width: '10%' }} className="row gap-1">
                      <StatusBadge domain="contract" status={contract.status} dot="static" />
                      {(channels.get(contract.id)?.counts.open_questions ?? 0) > 0 && (
                        <span
                          className="pill pill--rose text-2xs"
                          title="An agent on this contract is waiting for a person to answer."
                          style={{ height: 18, padding: '0 6px' }}
                        >
                          asking
                        </span>
                      )}
                    </span>
                    <span className="mono num" style={{ width: '10%', color: 'var(--fg-1)' }}>
                      {contract.current_turns}/{contract.max_turns}
                    </span>
                    <span className="mono num text-2xs" style={{ width: '15%', textAlign: 'right' }}>
                      {/* A live contract with an expiry is the one row on this
                          page with a deadline, and the column used to show only
                          how old it was — the least urgent fact available. */}
                      {expiry ? (
                        <span
                          style={{ color: expiry.soon ? 'var(--rose)' : 'var(--fg-2)' }}
                          title={`Expires ${formatDateTime(expiry.at)}`}
                        >
                          {expiry.label}
                        </span>
                      ) : (
                        <span className="dim">{formatDate(contract.created_at)}</span>
                      )}
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

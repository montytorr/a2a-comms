import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/db/server';
import { redirect } from 'next/navigation';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import type { Contract, ContractStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import ContractFilters from './filters';
import ContractRow from './contract-row';
import StatusBadge from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { Avatar, PageFrame, EmptyState } from '@/components/atoms';
import { getLinkedTasksForContracts } from '@/lib/contract-task-link';
import { describeContractLink, getRelatedContractsForContracts } from '@/lib/contract-links';
import { getOperatorChannelForContracts } from '@/lib/contract-operator-channel-server';
import { deriveContractTurnState } from '@/lib/contract-turn-state';
import { getLastMessages } from '@/app/api/v1/contracts/_helpers';
import { CornerUpLeft, FolderGit2, GitBranch, Link2Off, FileText } from 'lucide-react';
import styles from './contracts-list.module.css';

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
  const statusFilter = (params.status || 'open') as ContractStatus | 'all' | 'open';
  const searchFilter = params.search || '';
  const sortFilter = params.sort || 'newest';
  const db = createServerClient();
  noStore();

  let scopedContractIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: participantContracts } = await db
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', auth.agentScope);
    scopedContractIds = (participantContracts || []).map(p => p.contract_id);
  }

  let query = db
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

  if (statusFilter === 'open') {
    query = query.in('status', ['proposed', 'active']);
  } else if (statusFilter !== 'all') {
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
  const contractIds = rows.map((r) => r.id);
  // These are independent page-wide enrichments. Running them in series made
  // navigation cost the sum of four round trips after the main list query.
  const [linkedTasks, relatedContracts, channels, lastMessages] = await Promise.all([
    getLinkedTasksForContracts(contractIds),
    getRelatedContractsForContracts(contractIds),
    // An agent that has stopped to ask a person is the most actionable thing on
    // this page, and it was only visible by opening each contract in turn.
    getOperatorChannelForContracts(contractIds, null),
    // One query for the page, same as the links above.
    getLastMessages(contractIds),
  ]);

  return (
    <AutoRefresh intervalMs={15000} watch={['contracts', 'participants', 'messages']}>
      <PageFrame>
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

        <section className={styles.register} aria-label="Contract register">
          <div className={styles.registerHead}>
            <span>Contract register</span>
            <span className={styles.registerCount}>{rows.length} shown<span className={styles.registerHint}> · open a contract for its conversation</span></span>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={<FileText size={20} />}
              title="No contracts found"
              hint="No contract matches the current filters. Widen them, or propose a contract to start one."
            />
          ) : rows.map((contract) => {
            const proposerName = contract.proposer?.display_name || contract.proposer?.name || 'Unknown proposer';
            const participants = (contract.contract_participants || [])
              .map((participant) => {
                const name = participant.agent?.display_name || participant.agent?.name;
                return name ? { name, role: participant.role, status: participant.status } : null;
              })
              .filter((participant): participant is { name: string; role: string; status: string } => participant !== null);
            const linked = linkedTasks.get(contract.id);
            const related = relatedContracts.get(contract.id) || [];
            const expiry = describeExpiry(contract.status, contract.expires_at);
            const viewerAgentId = contract.contract_participants.find((participant) =>
              participant.agent?.id && auth.agentScope.includes(participant.agent.id)
            )?.agent?.id ?? null;
            const turnState = viewerAgentId ? deriveContractTurnState({
              contract,
              viewerAgentId,
              participants: contract.contract_participants.map((participant) => ({
                agent_id: participant.agent?.id ?? '',
                role: participant.role as 'proposer' | 'invitee' | 'observer',
                status: participant.status as 'pending' | 'accepted' | 'rejected',
                name: participant.agent?.display_name || participant.agent?.name || null,
              })),
              lastMessage: lastMessages.get(contract.id) ?? null,
              blockingQuestions: (channels.get(contract.id)?.questions ?? [])
                .filter((question) => question.status === 'open' && question.blocking)
                .map((question) => ({ asked_by_agent_id: question.asked_by_agent_id, kind: question.kind })),
            }) : null;

            return (
              <ContractRow key={contract.id} id={contract.id} title={contract.title}>
                <article className={styles.row}>
                  <div className={styles.primary}>
                    <div className={styles.titleLine}>
                      <span className={styles.title}>{contract.title}</span>
                      {turnState?.awaiting === 'you' && (
                        <StatusBadge
                          status="your move"
                          tone="amber"
                          dot="none"
                          title={turnState.reason}
                          label={<><CornerUpLeft size={10} />your move</>}
                        />
                      )}
                    </div>
                    <div className={styles.context}>
                      <span className={`${styles.contextItem} ${linked ? '' : contract.status === 'active' || contract.status === 'proposed' ? styles.unlinkedOpen : styles.unlinked}`}>
                        {linked ? <FolderGit2 size={13} /> : <Link2Off size={13} />}
                        <span>{linked
                          ? `${linked.project_title || 'Project'} › ${linked.task_title || 'Task'}`
                          : 'No linked project task'}</span>
                      </span>
                      {related.length > 0 && (
                        <span className={`${styles.contextItem} ${styles.related}`}>
                          <GitBranch size={13} />
                          <span>{describeContractLink(related[0].link_type, related[0].direction)} {related[0].title}{related.length > 1 ? ` +${related.length - 1}` : ''}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.secondary}>
                    <div className={styles.state}>
                      <StatusBadge domain="contract" status={contract.status} dot="static" />
                      {(channels.get(contract.id)?.counts.open_questions ?? 0) > 0 && (
                        <span className="pill pill--rose" title="An agent is waiting for a person to answer">asking</span>
                      )}
                      <span className={`${styles.date} ${expiry?.soon ? styles.urgent : ''}`} title={expiry ? `Expires ${formatDateTime(expiry.at)}` : `Created ${formatDateTime(contract.created_at)}`}>
                        {expiry ? expiry.label : formatDate(contract.created_at)}
                      </span>
                    </div>
                    <div className={styles.people}>
                      <span className={styles.peopleName}>{proposerName}</span>
                      <span className={styles.avatars} aria-label={`${participants.length} participants`}>
                        {participants.slice(0, 3).map((participant, index) => (
                          <span key={`${participant.name}-${index}`} title={`${participant.name} · ${participant.role} · ${participant.status}`}>
                            <Avatar name={participant.name} size={20} />
                          </span>
                        ))}
                        {participants.length > 3 && <span>+{participants.length - 3}</span>}
                      </span>
                      <span className={styles.turns}><strong>{contract.current_turns}</strong> / {contract.max_turns} turns</span>
                    </div>
                  </div>
                </article>
              </ContractRow>
            );
          })}
        </section>
      </PageFrame>
    </AutoRefresh>
  );
}

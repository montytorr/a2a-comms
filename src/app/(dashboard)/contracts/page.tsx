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

  return (
    <AutoRefresh intervalMs={15000}>
      <div style={{ padding: '28px 32px 60px' }}>
        {/* Header */}
        <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div className="col gap-1">
            <div className="upper">Communication</div>
            <div className="h1">Contracts</div>
            <div className="muted" style={{ fontSize: 13 }}>
              <span className="num">{rows.length}</span> contract{rows.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <ContractFilters current={statusFilter} />

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden', marginTop: 16 }}>
          {/* Header row */}
          <div className="row" style={{
            padding: '8px 18px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--line-1)',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--fg-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            <span style={{ width: '30%' }}>Title</span>
            <span style={{ width: '15%' }}>Proposer</span>
            <span style={{ width: '20%' }}>Participants</span>
            <span style={{ width: '10%' }}>Status</span>
            <span style={{ width: '10%' }}>Turns</span>
            <span style={{ width: '15%', textAlign: 'right' }}>Created</span>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="h3" style={{ marginTop: 14 }}>No contracts found</div>
              <div className="dim" style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your filters</div>
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

              return (
                <ContractRow key={contract.id} id={contract.id}>
                  <div className="row" style={{
                    padding: '10px 18px',
                    borderBottom: i === rows.length - 1 ? 'none' : '1px solid oklch(0.19 0.012 250)',
                    alignItems: 'center',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    width: '100%',
                  }}>
                    <span style={{ width: '30%', color: 'var(--fg-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contract.title}
                    </span>
                    <span className="mono" style={{ width: '15%', color: 'var(--fg-2)' }}>{proposerName}</span>
                    <span style={{ width: '20%' }}>
                      <div className="row gap-1">
                        {participants.slice(0, 3).map((p, j) => (
                          <Avatar key={j} name={p!.name} size={20} />
                        ))}
                        {participants.length > 3 && (
                          <span className="dim mono" style={{ fontSize: 11 }}>+{participants.length - 3}</span>
                        )}
                      </div>
                    </span>
                    <span style={{ width: '10%' }}>
                      <span className={`pill pill--${tone}`} style={{ height: 18, fontSize: 9.5 }}>
                        <span className={`dot dot--${tone}`} style={{ width: 4, height: 4 }} />
                        {contract.status}
                      </span>
                    </span>
                    <span className="mono num" style={{ width: '10%', color: 'var(--fg-1)' }}>
                      {contract.current_turns}/{contract.max_turns}
                    </span>
                    <span className="mono dim num" style={{ width: '15%', textAlign: 'right', fontSize: 11 }}>
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

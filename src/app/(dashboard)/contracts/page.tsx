import { unstable_noStore as noStore } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/status-badge';
import type { Contract, ContractStatus } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import ContractFilters from './filters';
import ContractRow from './contract-row';
import { formatDate } from '@/lib/format-date';
export const dynamic = 'force-dynamic';

const COL = {
  title: 'w-[30%]',
  proposer: 'w-[15%]',
  participants: 'w-[18%]',
  status: 'w-[12%]',
  turns: 'w-[12%]',
  created: 'w-[13%]',
} as const;

interface ContractWithRelations extends Contract {
  proposer: { name: string; display_name: string } | null;
  contract_participants: Array<{
    agent: { name: string; display_name: string } | null;
    role: string;
    status: string;
  }>;
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; sort?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const statusFilter = (params.status || 'all') as ContractStatus | 'all';
  const searchFilter = params.search || '';
  const sortFilter = params.sort || 'newest';
  const supabase = createServerClient();
  noStore();

  // For non-admin users, first get contract IDs where their agents participate
  let scopedContractIds: string[] | null = null;
  if (!user.isSuperAdmin) {
    const { data: participantContracts } = await supabase
      .from('contract_participants')
      .select('contract_id')
      .in('agent_id', user.agentIds.length > 0 ? user.agentIds : ['00000000-0000-0000-0000-000000000000']);
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

  // Scope to user's contracts if not admin
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

  // Apply sort
  if (sortFilter === 'oldest') {
    query = query.order('created_at', { ascending: true });
  } else if (sortFilter === 'most-turns') {
    query = query.order('current_turns', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: contracts, error } = await query;

  if (error) {
    console.error('Error fetching contracts:', error);
  }

  const rows = (contracts || []) as ContractWithRelations[];

  return (
    <AutoRefresh intervalMs={15000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 animate-fade-in">
        <div>
          <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Management</p>
          <h1 className="text-[32px] font-bold text-white tracking-tight">Contracts</h1>
          <p className="text-sm text-gray-600 mt-1">
            <span className="text-gray-400 tabular-nums font-medium">{rows.length}</span> contract{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <ContractFilters current={statusFilter} />

      {/* Table */}
      <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] table-fixed">
          <thead>
            <tr className="border-b border-white/[0.04]">
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.title}`}>Title</th>
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.proposer}`}>Proposer</th>
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.participants}`}>Participants</th>
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.status}`}>Status</th>
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.turns}`}>Turns</th>
              <th className={`text-left px-6 py-3 text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] ${COL.created}`}>Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-20 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-600 font-medium">No contracts found</p>
                  <p className="text-[11px] text-gray-700 mt-1">Try adjusting your filters</p>
                </td>
              </tr>
            ) : (
              rows.map((contract: ContractWithRelations) => {
                const proposerName = contract.proposer?.display_name || contract.proposer?.name || '—';
                const participants = (contract.contract_participants || [])
                  .map((p) => p.agent?.display_name || p.agent?.name)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <ContractRow key={contract.id} id={contract.id} col={COL}>
                    <td className={`px-6 py-4 ${COL.title}`}>
                      <span className="text-[13px] font-medium text-gray-200 group-hover:text-cyan-400 transition-colors duration-200 truncate block">
                        {contract.title}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${COL.proposer}`}>
                      <span className="text-[13px] text-gray-500 truncate block">{proposerName}</span>
                    </td>
                    <td className={`px-6 py-4 ${COL.participants}`}>
                      <span className="text-[13px] text-gray-500 truncate block">{participants || '—'}</span>
                    </td>
                    <td className={`px-6 py-4 ${COL.status}`}>
                      <StatusBadge status={contract.status} />
                    </td>
                    <td className={`px-6 py-4 ${COL.turns}`}>
                      <span className="text-[13px] text-gray-500 font-mono tabular-nums">
                        <span className="text-gray-300">{contract.current_turns}</span>
                        <span className="text-gray-700 mx-0.5">/</span>
                        <span className="text-gray-600">{contract.max_turns}</span>
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${COL.created}`}>
                      <span className="text-[11px] text-gray-600 font-mono tabular-nums">
                        {formatDate(contract.created_at)}
                      </span>
                    </td>
                  </ContractRow>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}

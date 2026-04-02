import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { redirect } from 'next/navigation';
import AutoRefresh from '@/components/auto-refresh';
import type { Agent } from '@/lib/types';
import { formatDate } from '@/lib/format-date';
export const dynamic = 'force-dynamic';

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

const avatarGlows = [
  'shadow-cyan-500/20',
  'shadow-violet-500/20',
  'shadow-emerald-500/20',
  'shadow-orange-500/20',
  'shadow-pink-500/20',
  'shadow-amber-500/20',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
}

function getInitials(name: string): string {
  return name.split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default async function AgentsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  let query = supabase
    .from('agents')
    .select(`
      *,
      service_keys(id, is_active)
    `)
    .order('created_at', { ascending: true });

  // Non-admin users only see their own agents
  if (!user.isSuperAdmin) {
    query = query.eq('owner_user_id', user.id);
  }

  const { data: agents } = await query;

  const rows = (agents || []) as (Agent & { service_keys: { id: string; is_active: boolean }[] })[];

  return (
    <AutoRefresh intervalMs={30000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Registry</p>
          <h1 className="text-[32px] font-bold text-white tracking-tight">Agents</h1>
          <p className="text-sm text-gray-600 mt-1">Registered agent identities</p>
        </div>
        <Link
          href="/agents/register"
          className="px-4 py-2.5 text-[12px] font-semibold rounded-xl bg-gradient-to-r from-cyan-500/[0.1] to-blue-500/[0.1] border border-cyan-500/20 text-cyan-400 hover:from-cyan-500/[0.18] hover:to-blue-500/[0.18] hover:border-cyan-500/30 transition-all duration-300 hover:shadow-[0_0_25px_rgba(6,182,212,0.08)] hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Register Agent
        </Link>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.length === 0 ? (
          <div className="col-span-2 rounded-2xl glass-card px-6 py-20 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 font-medium">No agents registered</p>
            <p className="text-[11px] text-gray-700 mt-1">Register agents to begin communicating</p>
          </div>
        ) : (
          rows.map((agent, idx) => {
            const activeKeys = agent.service_keys?.filter((k) => k.is_active).length || 0;
            const name = agent.display_name || agent.name;
            const avatarIdx = getAvatarIndex(name);
            const gradient = avatarGradients[avatarIdx];
            const glow = avatarGlows[avatarIdx];
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="rounded-2xl glass-card-hover overflow-hidden animate-fade-in block"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                {/* Top gradient accent */}
                <div className={`h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20`}
                  style={{ color: avatarIdx <= 1 ? '#06b6d4' : avatarIdx <= 3 ? '#8b5cf6' : '#10b981' }}
                />

                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* Avatar with glow */}
                    <div className="relative">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg ${glow} shrink-0`}>
                        <span className="text-sm font-bold text-white">{getInitials(name)}</span>
                      </div>
                      {/* Status indicator */}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a10] ${
                        activeKeys > 0 ? 'bg-emerald-400' : 'bg-gray-600'
                      }`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-[15px] font-bold text-white tracking-tight">{agent.display_name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.03]">{agent.name}</span>
                        <span className="text-[12px] text-gray-500">{agent.owner}</span>
                      </div>
                      {agent.description && (
                        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">{agent.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Capabilities */}
                  {agent.capabilities && agent.capabilities.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">Capabilities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.capabilities.map((cap) => (
                          <span key={cap} className="text-[10px] font-medium text-cyan-400 bg-cyan-500/[0.08] px-2 py-0.5 rounded-full border border-cyan-500/10">
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Protocols */}
                  {agent.protocols && agent.protocols.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">Protocols</p>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.protocols.map((proto) => (
                          <span key={proto} className="text-[10px] font-mono text-violet-400 bg-violet-500/[0.08] px-2 py-0.5 rounded-full border border-violet-500/10">
                            {proto}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-6 mt-5 pt-4 border-t border-white/[0.04]">
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Active Keys</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${activeKeys > 0 ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-gray-600'}`} />
                        <span className={`text-sm font-mono font-semibold ${activeKeys > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                          {activeKeys}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Max Active Contracts</p>
                      <span className="text-sm text-gray-400 font-mono tabular-nums">
                        {agent.max_concurrent_contracts || '∞'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-0.5">Registered</p>
                      <span className="text-sm text-gray-400 font-mono tabular-nums">
                        {formatDate(agent.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
    </AutoRefresh>
  );
}

import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import type { Agent, ServiceKey } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import KeyActions from './key-actions';
import { formatDate, formatDateTime } from '@/lib/format-date';

export const dynamic = 'force-dynamic';

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
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

type ServiceKeyRow = Pick<ServiceKey, 'id' | 'key_id' | 'is_active' | 'created_at' | 'rotated_at' | 'expires_at' | 'label'>;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    notFound();
  }

  // Non-admin users can only view their own agents
  if (!user.isSuperAdmin && (agent as Agent).owner_user_id !== user.id) {
    notFound();
  }

  const { data: keys } = await supabase
    .from('service_keys')
    .select('id, key_id, is_active, created_at, rotated_at, expires_at, label')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  const serviceKeys = (keys || []) as ServiceKeyRow[];
  const agentData = agent as Agent;
  const name = agentData.display_name || agentData.name;
  const avatarIdx = getAvatarIndex(name);
  const gradient = avatarGradients[avatarIdx];
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return (
    <AutoRefresh intervalMs={30000}>
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Back link */}
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-cyan-400 transition-colors duration-200 mb-6 group">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform duration-200">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      {/* Agent Header Card */}
      <div className="rounded-2xl glass-card overflow-hidden mb-8 animate-fade-in">
        <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <div className="p-7">
          <div className="flex items-start gap-5 mb-6">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shrink-0`}>
              <span className="text-lg font-bold text-white">{getInitials(name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight mb-1">{agentData.display_name}</h1>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-md border border-white/[0.03]">{agentData.name}</span>
                <span className="text-[12px] text-gray-500">{agentData.owner}</span>
              </div>
              {agentData.description && (
                <p className="text-[13px] text-gray-500 mt-3 leading-relaxed">{agentData.description}</p>
              )}
            </div>
          </div>

          {/* Capabilities */}
          {agentData.capabilities && agentData.capabilities.length > 0 && (
            <div className="mb-5">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {agentData.capabilities.map((cap) => (
                  <span key={cap} className="text-[10px] font-medium text-cyan-400 bg-cyan-500/[0.08] px-2 py-0.5 rounded-full border border-cyan-500/10">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Protocols */}
          {agentData.protocols && agentData.protocols.length > 0 && (
            <div className="mb-5">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">Protocols</p>
              <div className="flex flex-wrap gap-1.5">
                {agentData.protocols.map((proto) => (
                  <span key={proto} className="text-[10px] font-mono text-violet-400 bg-violet-500/[0.08] px-2 py-0.5 rounded-full border border-violet-500/10">
                    {proto}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-5 border-t border-white/[0.04]">
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Active Keys</p>
              <span className="text-sm font-mono font-semibold text-emerald-400">
                {serviceKeys.filter((k) => k.is_active).length}
              </span>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Max Active Contracts</p>
              <span className="text-sm text-gray-400 font-mono tabular-nums">
                {agentData.max_concurrent_contracts || '∞'}
              </span>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Registered</p>
              <span className="text-sm text-gray-400 font-mono tabular-nums">
                {formatDate(agentData.created_at)}
              </span>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.2em] mb-1.5">Updated</p>
              <span className="text-sm text-gray-400 font-mono tabular-nums">
                {formatDate(agentData.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Service Keys Section */}
      <div className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        <div className="px-7 py-5 border-b border-white/[0.04] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white tracking-tight">Service Keys</h2>
            <p className="text-[11px] text-gray-600 mt-0.5">{serviceKeys.length} key{serviceKeys.length !== 1 ? 's' : ''}</p>
          </div>
          <KeyActions agentId={agentData.id} />
        </div>

        <div className="p-5 space-y-3">
          {serviceKeys.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-600 font-medium">No service keys</p>
              <p className="text-[11px] text-gray-700 mt-1">Use &quot;Rotate Key&quot; to generate a new key</p>
            </div>
          ) : (
            serviceKeys.map((key) => {
              const isExpired = key.expires_at && new Date(key.expires_at) < now;
              const isExpiring = key.expires_at && !isExpired && new Date(key.expires_at) < twoHoursFromNow;

              return (
                <div
                  key={key.id}
                  className={`rounded-xl border p-4 ${
                    !key.is_active || isExpired
                      ? 'bg-white/[0.01] border-white/[0.03] opacity-50'
                      : isExpiring
                        ? 'bg-amber-500/[0.03] border-amber-500/10'
                        : 'bg-white/[0.02] border-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      !key.is_active || isExpired
                        ? 'bg-gray-600'
                        : isExpiring
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    }`} />
                    <code className="text-[13px] font-mono text-gray-300 flex-1 truncate">{key.key_id}</code>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      !key.is_active || isExpired
                        ? 'text-gray-600 bg-white/[0.02]'
                        : isExpiring
                          ? 'text-amber-400 bg-amber-500/[0.08]'
                          : 'text-emerald-400 bg-emerald-500/[0.08]'
                    }`}>
                      {isExpired ? 'Expired' : !key.is_active ? 'Inactive' : isExpiring ? 'Expiring' : 'Active'}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 mt-3 ml-5">
                    {key.label && (
                      <span className="text-[10px] text-gray-600">{key.label}</span>
                    )}
                    <span className="text-[10px] text-gray-700 font-mono tabular-nums ml-auto">
                      Created {formatDate(key.created_at)}
                    </span>
                    {key.rotated_at && (
                      <span className="text-[10px] text-amber-500/60 font-mono tabular-nums">
                        Rotated {formatDate(key.rotated_at)}
                      </span>
                    )}
                    {key.expires_at && (
                      <span className={`text-[10px] font-mono tabular-nums ${isExpired ? 'text-gray-600' : 'text-amber-400/80'}`}>
                        {isExpired ? 'Expired' : 'Expires'} {formatDateTime(key.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}

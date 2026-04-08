'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TRUST_TIER_LABELS, normalizeAgentTrustTier } from '@/lib/trust-tiers';
import { proposeContractFromDashboard } from './actions';

interface AgentOption {
  id: string;
  name: string;
  display_name: string;
  trust_tier?: string | null;
}

interface Props {
  proposerAgents: AgentOption[];
  availableAgents: AgentOption[];
}

function sortByLabel<T extends AgentOption>(agents: T[]) {
  return [...agents].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
}

export default function ProposeContractPanel({ proposerAgents, availableAgents }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [messageSchema, setMessageSchema] = useState('');
  const [maxTurns, setMaxTurns] = useState('50');
  const [expiresInHours, setExpiresInHours] = useState('168');
  const [proposerAgentId, setProposerAgentId] = useState(proposerAgents[0]?.id || '');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [observers, setObservers] = useState<string[]>([]);

  const sortedAgents = useMemo(() => sortByLabel(availableAgents), [availableAgents]);
  const sortedProposers = useMemo(() => sortByLabel(proposerAgents), [proposerAgents]);
  const agentById = useMemo(() => new Map(sortedAgents.map((agent) => [agent.id, agent])), [sortedAgents]);

  function toggleSelection(agentName: string, kind: 'invitee' | 'observer') {
    const setter = kind === 'invitee' ? setInvitees : setObservers;
    const other = kind === 'invitee' ? observers : invitees;
    setter((current) => {
      const exists = current.includes(agentName);
      if (exists) return current.filter((value) => value !== agentName);
      return [...current, agentName].filter((value) => !other.includes(value));
    });
    if (kind === 'invitee') {
      setObservers((current) => current.filter((value) => value !== agentName));
    } else {
      setInvitees((current) => current.filter((value) => value !== agentName));
    }
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setMessageSchema('');
    setMaxTurns('50');
    setExpiresInHours('168');
    setInvitees([]);
    setObservers([]);
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('proposer_agent_id', proposerAgentId);
        formData.set('title', title);
        formData.set('description', description);
        formData.set('invitees', JSON.stringify(invitees));
        formData.set('observers', JSON.stringify(observers));
        formData.set('max_turns', maxTurns);
        formData.set('expires_in_hours', expiresInHours);
        if (messageSchema.trim()) {
          JSON.parse(messageSchema);
          formData.set('message_schema', messageSchema);
        }
        await proposeContractFromDashboard(formData);
        setSuccess('Contract proposed. Observers are attached as read-only from the start.');
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to propose contract');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-cyan-500/12 bg-white/[0.02] p-5 mb-6">
      <div className="mb-4">
        <p className="text-[10px] font-semibold text-cyan-300 uppercase tracking-[0.18em]">Propose contract</p>
        <h2 className="text-[15px] font-semibold text-white mt-1">Generic contract flow</h2>
        <p className="text-[11px] text-gray-400 mt-1 max-w-3xl">
          Invite executors, attach read-only observers up front, and keep trust-tier enforcement centralized. Observers can inspect context, not mutate it.
        </p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200">{error}</div>}
      {success && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-emerald-200">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Proposer</label>
          <select value={proposerAgentId} onChange={(e) => setProposerAgentId(e.target.value)} disabled={isPending} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30">
            {sortedProposers.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.display_name || agent.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" disabled={isPending} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} disabled={isPending} placeholder="Goal, scope, and success criteria." className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Message schema JSON (optional)</label>
          <textarea value={messageSchema} onChange={(e) => setMessageSchema(e.target.value)} rows={5} disabled={isPending} placeholder='{"type":"object","properties":{"summary":{"type":"string"}}}' className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 font-mono text-[12px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <div className="rounded-xl border border-white/[0.05] bg-[#0a0a14] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] font-semibold text-white">Invitees</p>
              <p className="text-[10px] text-gray-500">These agents can accept and participate normally.</p>
            </div>
            <span className="text-[10px] text-gray-500">{invitees.length} selected</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {sortedAgents.map((agent) => {
              const label = agent.display_name || agent.name;
              const tier = normalizeAgentTrustTier(agent.trust_tier);
              const checked = invitees.includes(agent.name);
              return (
                <label key={`invitee-${agent.id}`} className="flex items-start gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 cursor-pointer hover:bg-white/[0.04]">
                  <input type="checkbox" checked={checked} onChange={() => toggleSelection(agent.name, 'invitee')} disabled={isPending} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-gray-200">{label}</span>
                    <span className="block text-[10px] text-gray-500">@{agent.name} · {TRUST_TIER_LABELS[tier]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/12 bg-[#0a0a14] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] font-semibold text-white">Observers</p>
              <p className="text-[10px] text-gray-500">Read-only from the start. They can inspect context, not send contract mutations.</p>
            </div>
            <span className="text-[10px] text-gray-500">{observers.length} selected</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {sortedAgents.map((agent) => {
              const label = agent.display_name || agent.name;
              const tier = normalizeAgentTrustTier(agent.trust_tier);
              const checked = observers.includes(agent.name);
              return (
                <label key={`observer-${agent.id}`} className="flex items-start gap-3 rounded-lg border border-cyan-500/10 bg-cyan-500/[0.03] px-3 py-2 cursor-pointer hover:bg-cyan-500/[0.06]">
                  <input type="checkbox" checked={checked} onChange={() => toggleSelection(agent.name, 'observer')} disabled={isPending} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-gray-200">{label}</span>
                    <span className="block text-[10px] text-gray-500">@{agent.name} · {TRUST_TIER_LABELS[tier]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Max turns</label>
          <input value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} disabled={isPending} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Expires in hours</label>
          <input value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)} disabled={isPending} className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30" />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={handleSubmit} disabled={isPending || !proposerAgentId || !title.trim() || invitees.length === 0} className="w-full px-3 py-2.5 rounded-xl bg-cyan-500/18 border border-cyan-500/25 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/28 disabled:opacity-40">
            {isPending ? 'Proposing…' : 'Propose contract'}
          </button>
        </div>
      </div>

      {(invitees.length > 0 || observers.length > 0) && (
        <div className="mt-4 rounded-xl border border-white/[0.04] bg-[#0a0a14] px-4 py-3 text-[11px] text-gray-400">
          <p>
            Invitees: <span className="text-gray-200">{invitees.join(', ') || '—'}</span>
          </p>
          <p className="mt-1">
            Observers: <span className="text-cyan-200">{observers.join(', ') || '—'}</span>
          </p>
        </div>
      )}
    </div>
  );
}

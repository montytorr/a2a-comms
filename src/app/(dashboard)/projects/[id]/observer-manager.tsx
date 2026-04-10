'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TRUST_TIER_LABELS, normalizeAgentTrustTier } from '@/lib/trust-tiers';

interface AgentOption {
  id: string;
  name: string;
  display_name: string;
  trust_tier?: string | null;
}

interface ObserverRow {
  id: string;
  note?: string | null;
  created_at: string;
  agent?: { id: string; name: string; display_name: string; trust_tier?: string | null } | null;
  invited_by?: { id: string; name: string; display_name: string } | null;
}

interface Props {
  projectId: string;
  isOwner: boolean;
  availableAgents: AgentOption[];
  observers: ObserverRow[];
}

export default function ObserverManager({ projectId, isOwner, availableAgents, observers }: Props) {
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState(availableAgents[0]?.id || '');
  const [newNote, setNewNote] = useState('');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() => Object.fromEntries(observers.map((observer) => [observer.id, observer.note || ''])));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAgent = useMemo(() => availableAgents.find((agent) => agent.id === selectedAgentId) || null, [availableAgents, selectedAgentId]);

  async function requestObserverMutation(input: { method: 'POST' | 'PATCH' | 'DELETE'; observerId?: string; note?: string | null; agentId?: string }) {
    const suffix = input.observerId ? `/${input.observerId}` : '';
    const res = await fetch(`/api/v1/projects/${projectId}/observers${suffix}`, {
      method: input.method,
      headers: input.method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
      body: input.method === 'DELETE' ? undefined : JSON.stringify({
        agent_id: input.agentId,
        note: input.note,
      }),
    });

    if (!res.ok) {
      let message = 'Observer update failed';
      try {
        const payload = await res.json();
        if (typeof payload?.error === 'string' && payload.error) message = payload.error;
      } catch {}
      throw new Error(message);
    }

    router.refresh();
  }

  function addObserver() {
    if (!selectedAgentId) return;
    setError(null);
    startTransition(async () => {
      try {
        await requestObserverMutation({ method: 'POST', agentId: selectedAgentId, note: newNote.trim() || null });
        setNewNote('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add observer');
      }
    });
  }

  function updateObserver(observerId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await requestObserverMutation({ method: 'PATCH', observerId, note: draftNotes[observerId]?.trim() || null });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update observer');
      }
    });
  }

  function removeObserver(observerId: string) {
    if (!confirm('Remove this observer from the project?')) return;
    setError(null);
    startTransition(async () => {
      try {
        await requestObserverMutation({ method: 'DELETE', observerId });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove observer');
      }
    });
  }

  return (
    <div className="rounded-2xl border border-cyan-500/12 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <p className="text-[10px] font-semibold text-cyan-300 uppercase tracking-[0.18em]">Observer access</p>
          <h3 className="text-[15px] font-semibold text-white mt-1">Read-only collaborators</h3>
          <p className="text-[11px] text-gray-400 mt-1 max-w-2xl">
            Observers can inspect project/task execution and leave analysis notes, but they cannot mutate state. Trust rules still apply.
          </p>
        </div>
        <span className="text-[11px] text-gray-500">{observers.length} observer{observers.length !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200">{error}</div>}

      {isOwner && (
        <div className="mb-5 rounded-xl border border-white/[0.05] bg-[#0a0a14] p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,240px),1fr,auto] items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Invite observer</label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                disabled={isPending || availableAgents.length === 0}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 focus:outline-none focus:border-cyan-500/30 disabled:opacity-60"
              >
                {availableAgents.length === 0 ? (
                  <option value="">No eligible agents</option>
                ) : (
                  availableAgents.map((agent) => {
                    const tier = normalizeAgentTrustTier(agent.trust_tier);
                    return (
                      <option key={agent.id} value={agent.id}>{(agent.display_name || agent.name)} · {TRUST_TIER_LABELS[tier]}</option>
                    );
                  })
                )}
              </select>
              {selectedAgent && (
                <p className="text-[10px] text-gray-600 mt-2">
                  @{selectedAgent.name} · {TRUST_TIER_LABELS[normalizeAgentTrustTier(selectedAgent.trust_tier)]}
                </p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Observer note</label>
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="What are they watching for?"
                disabled={isPending || !selectedAgentId}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[13px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={addObserver}
              disabled={isPending || !selectedAgentId}
              className="px-3 py-2.5 rounded-xl bg-cyan-500/18 border border-cyan-500/25 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/28 disabled:opacity-40"
            >
              Add observer
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {observers.length === 0 ? (
          <div className="rounded-xl border border-white/[0.04] bg-[#0a0a14] px-4 py-5 text-[11px] text-gray-500">No observers attached.</div>
        ) : (
          observers.map((observer) => {
            const agentName = observer.agent?.display_name || observer.agent?.name || 'Unknown';
            const tier = normalizeAgentTrustTier(observer.agent?.trust_tier);
            const invitedBy = observer.invited_by?.display_name || observer.invited_by?.name || 'Unknown';
            return (
              <div key={observer.id} className="rounded-xl border border-white/[0.04] bg-[#0a0a14] px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12px] font-semibold text-white">{agentName}</p>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-gray-400 uppercase tracking-wide">
                        {TRUST_TIER_LABELS[tier]}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">Invited by {invitedBy}</p>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => removeObserver(observer.id)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-md text-[10px] text-red-300 border border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/[0.12] disabled:opacity-40"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={draftNotes[observer.id] || ''}
                    onChange={(e) => setDraftNotes((current) => ({ ...current, [observer.id]: e.target.value }))}
                    disabled={!isOwner || isPending}
                    placeholder="Observer note"
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 disabled:opacity-70"
                  />
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => updateObserver(observer.id)}
                      disabled={isPending}
                      className="px-2.5 py-2 rounded-lg border border-white/[0.08] text-[10px] text-gray-300 hover:bg-white/[0.04] disabled:opacity-40"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

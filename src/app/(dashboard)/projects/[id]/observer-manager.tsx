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
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(observers.map((observer) => [observer.id, observer.note || '']))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedAgent = useMemo(
    () => availableAgents.find((agent) => agent.id === selectedAgentId) || null,
    [availableAgents, selectedAgentId]
  );

  async function requestObserverMutation(input: {
    method: 'POST' | 'PATCH' | 'DELETE';
    observerId?: string;
    note?: string | null;
    agentId?: string;
  }) {
    const suffix = input.observerId ? `/${input.observerId}` : '';
    const res = await fetch(`/api/v1/projects/${projectId}/observers${suffix}`, {
      method: input.method,
      headers: input.method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
      body:
        input.method === 'DELETE'
          ? undefined
          : JSON.stringify({ agent_id: input.agentId, note: input.note }),
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
        await requestObserverMutation({
          method: 'POST',
          agentId: selectedAgentId,
          note: newNote.trim() || null,
        });
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
        await requestObserverMutation({
          method: 'PATCH',
          observerId,
          note: draftNotes[observerId]?.trim() || null,
        });
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
    <div className="card" style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <p className="upper" style={{ color: 'var(--peri)', marginBottom: 4 }}>Observer access</p>
          <h3 className="h3">Read-only collaborators</h3>
          <p className="muted" style={{ marginTop: 4, maxWidth: '38ch', fontSize: 11 }}>
            Observers can inspect project/task execution and leave analysis notes, but they cannot
            mutate state. Trust rules still apply.
          </p>
        </div>
        <span className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          {observers.length} observer{observers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div
          className="pill pill--rose"
          style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, fontSize: 11 }}
        >
          {error}
        </div>
      )}

      {isOwner && (
        <div className="card--inset" style={{ marginBottom: 20, padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'minmax(0,240px) 1fr auto',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
                Invite observer
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                disabled={isPending || availableAgents.length === 0}
                className="cp-select"
                style={{ width: '100%' }}
              >
                {availableAgents.length === 0 ? (
                  <option value="">No eligible agents</option>
                ) : (
                  availableAgents.map((agent) => {
                    const tier = normalizeAgentTrustTier(agent.trust_tier);
                    return (
                      <option key={agent.id} value={agent.id}>
                        {agent.display_name || agent.name} · {TRUST_TIER_LABELS[tier]}
                      </option>
                    );
                  })
                )}
              </select>
              {selectedAgent && (
                <p className="dim" style={{ fontSize: 10, marginTop: 8 }}>
                  @{selectedAgent.name} ·{' '}
                  {TRUST_TIER_LABELS[normalizeAgentTrustTier(selectedAgent.trust_tier)]}
                </p>
              )}
            </div>
            <div>
              <label className="upper" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
                Observer note
              </label>
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="What are they watching for?"
                disabled={isPending || !selectedAgentId}
                className="cp-input"
                style={{ width: '100%' }}
              />
            </div>
            <button
              type="button"
              onClick={addObserver}
              disabled={isPending || !selectedAgentId}
              className="btn btn--primary"
            >
              Add observer
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {observers.length === 0 ? (
          <div
            className="card--inset"
            style={{ padding: '20px 16px', fontSize: 11, color: 'var(--fg-4)' }}
          >
            No observers attached.
          </div>
        ) : (
          observers.map((observer) => {
            const agentName =
              observer.agent?.display_name || observer.agent?.name || 'Unknown';
            const tier = normalizeAgentTrustTier(observer.agent?.trust_tier);
            const invitedBy =
              observer.invited_by?.display_name || observer.invited_by?.name || 'Unknown';
            return (
              <div key={observer.id} className="card--inset" style={{ padding: '12px 16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-1)' }}>
                        {agentName}
                      </p>
                      <span className="pill pill--ghost">{TRUST_TIER_LABELS[tier]}</span>
                    </div>
                    <p className="dim" style={{ fontSize: 10, marginTop: 4 }}>
                      Invited by {invitedBy}
                    </p>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => removeObserver(observer.id)}
                      disabled={isPending}
                      className="btn btn--danger btn--sm"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div
                  style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    value={draftNotes[observer.id] || ''}
                    onChange={(e) =>
                      setDraftNotes((current) => ({ ...current, [observer.id]: e.target.value }))
                    }
                    disabled={!isOwner || isPending}
                    placeholder="Observer note"
                    className="cp-input"
                    style={{ flex: 1 }}
                  />
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => updateObserver(observer.id)}
                      disabled={isPending}
                      className="btn btn--ghost btn--sm"
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

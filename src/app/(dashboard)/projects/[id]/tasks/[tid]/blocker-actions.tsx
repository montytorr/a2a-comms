'use client';

import { useMemo, useState, useTransition } from 'react';
import { escalateBlockedTask, logBlockerFollowUp } from './actions';

function toLocalInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function BlockerActions({
  projectId,
  taskId,
  canEscalate,
  currentAction,
  currentOwner,
  currentDueAt,
}: {
  projectId: string;
  taskId: string;
  canEscalate: boolean;
  currentAction?: string | null;
  currentOwner?: string | null;
  currentDueAt?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [openMode, setOpenMode] = useState<'follow-up' | 'escalate' | null>(null);
  const [nextAction, setNextAction] = useState(currentAction || '');
  const [owner, setOwner] = useState(currentOwner || '');
  const [dueAt, setDueAt] = useState(toLocalInputValue(currentDueAt));
  const [error, setError] = useState<string | null>(null);

  const helperText = useMemo(
    () => openMode === 'escalate'
      ? 'Escalation updates the unblock plan and flags the blocker as escalated for audit and notification flows.'
      : 'Follow-up records the concrete next unblock step, owner, and timing so the blocker stays actionable.',
    [openMode],
  );

  function open(mode: 'follow-up' | 'escalate') {
    setError(null);
    setOpenMode(mode);
  }

  function close() {
    if (isPending) return;
    setOpenMode(null);
    setError(null);
  }

  function submit(mode: 'follow-up' | 'escalate') {
    setError(null);
    startTransition(async () => {
      try {
        const payload = { nextAction, owner, dueAt };
        if (mode === 'escalate') {
          await escalateBlockedTask(projectId, taskId, payload);
        } else {
          await logBlockerFollowUp(projectId, taskId, payload);
        }
        setOpenMode(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update blocker workflow');
      }
    });
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => open('follow-up')}
          disabled={isPending}
          className="btn btn--sm"
          style={{
            borderColor: 'oklch(0.55 0.12 60 / 0.55)',
            color: 'var(--amber)',
            background: 'var(--amber-bg)',
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {isPending && openMode === 'follow-up' ? 'Working…' : 'Log follow-up'}
        </button>
        <button
          type="button"
          onClick={() => open('escalate')}
          disabled={isPending || !canEscalate}
          className="btn btn--sm btn--danger"
          style={{ opacity: isPending || !canEscalate ? 0.4 : 1 }}
        >
          {isPending && openMode === 'escalate' ? 'Working…' : 'Escalate blocker'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>
          Capture the unblock plan so blocked work shows owner, next step, and expected timing.
        </span>
      </div>

      {openMode && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animationDuration: '0.2s',
          }}
        >
          <div
            style={{ position: 'absolute', inset: 0, background: 'oklch(0.05 0.01 250 / 0.75)', backdropFilter: 'blur(6px)' }}
            onClick={close}
          />
          <div
            className="card"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 520,
              margin: '0 16px',
              background: 'var(--bg-1)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 24px 64px oklch(0.05 0.01 250 / 0.8)',
              overflow: 'hidden',
            }}
          >
            {/* top accent line */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: openMode === 'escalate'
                ? 'linear-gradient(90deg, transparent, var(--rose), transparent)'
                : 'linear-gradient(90deg, transparent, var(--amber), transparent)',
              opacity: 0.6,
            }} />

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 className="h3" style={{ fontSize: 18 }}>
                  {openMode === 'escalate' ? 'Escalate blocker' : 'Log blocker follow-up'}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 8, lineHeight: 1.6 }}>{helperText}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'block' }}>
                  <span className="upper" style={{ display: 'block', marginBottom: 8 }}>Next action / reason</span>
                  <textarea
                    value={nextAction}
                    onChange={(event) => setNextAction(event.target.value)}
                    rows={3}
                    placeholder={openMode === 'escalate' ? 'Explain what needs intervention next' : 'Describe the next unblock step'}
                    className="cp-input"
                    style={{
                      height: 'auto',
                      minHeight: 72,
                      padding: '8px 10px',
                      resize: 'none',
                      lineHeight: 1.5,
                    }}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <label style={{ display: 'block' }}>
                    <span className="upper" style={{ display: 'block', marginBottom: 8 }}>Unblock owner</span>
                    <input
                      type="text"
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                      placeholder="Example: API team, Cal, broker agent"
                      className="cp-input"
                    />
                  </label>

                  <label style={{ display: 'block' }}>
                    <span className="upper" style={{ display: 'block', marginBottom: 8 }}>Expected follow-up time</span>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                      className="cp-input"
                      style={{ colorScheme: 'dark' }}
                    />
                  </label>
                </div>

                {error && <p style={{ fontSize: 12, color: 'var(--rose)' }}>{error}</p>}
              </div>
            </div>

            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="btn"
                style={{ flex: 1, justifyContent: 'center', opacity: isPending ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit(openMode)}
                disabled={isPending}
                className="btn btn--sm"
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  height: 44,
                  fontSize: 12,
                  fontWeight: 700,
                  opacity: isPending ? 0.5 : 1,
                  ...(openMode === 'escalate'
                    ? { background: 'var(--rose-bg)', borderColor: 'oklch(0.55 0.10 25 / 0.55)', color: 'var(--rose)' }
                    : { background: 'var(--amber-bg)', borderColor: 'oklch(0.55 0.12 60 / 0.55)', color: 'var(--amber)' }
                  ),
                }}
              >
                {isPending ? 'Saving…' : openMode === 'escalate' ? 'Save escalation plan' : 'Save follow-up plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => open('follow-up')}
          disabled={isPending}
          className="inline-flex items-center rounded-lg px-3 py-2 text-[11px] font-semibold bg-amber-500/[0.12] text-amber-200 border border-amber-500/20 hover:bg-amber-500/[0.18] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending && openMode === 'follow-up' ? 'Working…' : 'Log follow-up'}
        </button>
        <button
          type="button"
          onClick={() => open('escalate')}
          disabled={isPending || !canEscalate}
          className="inline-flex items-center rounded-lg px-3 py-2 text-[11px] font-semibold bg-red-500/[0.12] text-red-200 border border-red-500/20 hover:bg-red-500/[0.18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isPending && openMode === 'escalate' ? 'Working…' : 'Escalate blocker'}
        </button>
        <span className="text-[10px] text-gray-500">
          Capture the unblock plan so blocked work shows owner, next step, and expected timing.
        </span>
      </div>

      {openMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ animationDuration: '0.2s' }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={close} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-[#0e0e15]/95 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/60 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {openMode === 'escalate' ? 'Escalate blocker' : 'Log blocker follow-up'}
                </h3>
                <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">{helperText}</p>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Next action / reason</span>
                  <textarea
                    value={nextAction}
                    onChange={(event) => setNextAction(event.target.value)}
                    rows={3}
                    placeholder={openMode === 'escalate' ? 'Explain what needs intervention next' : 'Describe the next unblock step'}
                    className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Unblock owner</span>
                    <input
                      type="text"
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                      placeholder="Example: API team, Cal, broker agent"
                      className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-[13px] text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Expected follow-up time</span>
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-[13px] text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </label>
                </div>

                {error && <p className="text-[12px] text-red-300">{error}</p>}
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="flex-1 px-4 py-3 text-[12px] font-semibold rounded-xl border border-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submit(openMode)}
                disabled={isPending}
                className={`flex-1 px-4 py-3 text-[12px] font-bold rounded-xl transition-all duration-300 disabled:opacity-50 ${openMode === 'escalate' ? 'bg-red-500/[0.1] border border-red-500/20 text-red-300 hover:bg-red-500/[0.2]' : 'bg-amber-500/[0.12] border border-amber-500/20 text-amber-200 hover:bg-amber-500/[0.18]'}`}
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

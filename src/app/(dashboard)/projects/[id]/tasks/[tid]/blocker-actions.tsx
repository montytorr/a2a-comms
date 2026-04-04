'use client';

import { useTransition } from 'react';
import { escalateBlockedTask, logBlockerFollowUp } from './actions';

export default function BlockerActions({
  projectId,
  taskId,
  canEscalate,
}: {
  projectId: string;
  taskId: string;
  canEscalate: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      <button
        type="button"
        onClick={() => startTransition(async () => logBlockerFollowUp(projectId, taskId))}
        disabled={isPending}
        className="inline-flex items-center rounded-lg px-3 py-2 text-[11px] font-semibold bg-amber-500/[0.12] text-amber-200 border border-amber-500/20 hover:bg-amber-500/[0.18] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Working…' : 'Log follow-up'}
      </button>
      <button
        type="button"
        onClick={() => startTransition(async () => escalateBlockedTask(projectId, taskId))}
        disabled={isPending || !canEscalate}
        className="inline-flex items-center rounded-lg px-3 py-2 text-[11px] font-semibold bg-red-500/[0.12] text-red-200 border border-red-500/20 hover:bg-red-500/[0.18] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Working…' : 'Escalate blocker'}
      </button>
      <span className="text-[10px] text-gray-500">
        Follow-up logs operator action. Escalation is intended for stale blockers and seeds webhook/email automation.
      </span>
    </div>
  );
}

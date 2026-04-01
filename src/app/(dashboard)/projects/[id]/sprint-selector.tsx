'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SprintStatusDropdown from './sprint-status-dropdown';
import { createSprint, updateSprint } from './actions';

interface SprintSelectorProps {
  sprints: Array<{
    id: string;
    title: string;
    status: string;
    goal: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;
  currentSprintId: string;
  projectId: string;
  sprintStats?: Record<string, { total: number; done: number }>;
}

function SprintEditForm({
  projectId,
  sprint,
  onDone,
}: {
  projectId: string;
  sprint?: { id: string; title: string; start_date: string | null; end_date: string | null; goal: string | null };
  onDone: () => void;
}) {
  const [title, setTitle] = useState(sprint?.title || '');
  const [startDate, setStartDate] = useState(sprint?.start_date?.split('T')[0] || '');
  const [endDate, setEndDate] = useState(sprint?.end_date?.split('T')[0] || '');
  const [goal, setGoal] = useState(sprint?.goal || '');
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    startTransition(async () => {
      if (sprint) {
        await updateSprint(projectId, sprint.id, {
          title: trimmed,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          goal: goal || undefined,
        });
      } else {
        await createSprint(
          projectId,
          trimmed,
          startDate || undefined,
          endDate || undefined,
          goal || undefined,
        );
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-cyan-500/20 bg-white/[0.02] p-3 animate-fade-in">
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sprint title…"
        disabled={isPending}
        className="w-full bg-transparent text-[12px] text-white placeholder-gray-600 outline-none mb-2 border-b border-white/[0.06] pb-1.5 focus:border-cyan-500/30"
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold">End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isPending}
            className="w-full bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none [color-scheme:dark]"
          />
        </div>
      </div>
      <input
        type="text"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Sprint goal (optional)…"
        disabled={isPending}
        className="w-full bg-transparent text-[11px] text-gray-400 placeholder-gray-600 outline-none mb-2"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onDone}
          className="px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isPending}
          className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {isPending ? 'Saving…' : sprint ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function SprintSelector({ sprints, currentSprintId, projectId, sprintStats }: SprintSelectorProps) {
  const router = useRouter();
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);

  const tabs = [
    { id: 'all', label: 'All Tasks' },
    { id: 'backlog', label: 'Backlog' },
    ...sprints.map(s => ({ id: s.id, label: s.title, status: s.status })),
  ];

  const activeSprint = sprints.find(s => s.id === currentSprintId);

  return (
    <div className="mb-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
      <div className="flex gap-2 flex-wrap mb-3 items-center">
        {tabs.map((tab) => {
          const isActive = currentSprintId === tab.id;
          const sprintStatus = 'status' in tab ? tab.status : null;
          const stats = sprintStats?.[tab.id];
          const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : null;
          const sprintData = sprints.find(s => s.id === tab.id);

          return (
            <div key={tab.id} className="flex items-center gap-0.5 group/sprint">
              <button
                onClick={() => {
                  const params = tab.id === 'all' ? '' : `?sprint=${tab.id}`;
                  router.push(`/projects/${projectId}${params}`);
                }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wider uppercase transition-all duration-300 border flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                    : 'text-gray-600 border-white/[0.04] hover:text-gray-400 hover:border-white/[0.08] hover:bg-white/[0.02]'
                }`}
              >
                {sprintStatus && (
                  <span className={`w-1.5 h-1.5 rounded-full ${sprintStatus === 'active' ? 'bg-cyan-400' : sprintStatus === 'completed' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                )}
                {tab.label}
                {pct !== null && stats && stats.total > 0 && (
                  <span className={`ml-1 text-[9px] font-mono tabular-nums ${
                    pct === 100 ? 'text-emerald-400' : isActive ? 'text-cyan-400/70' : 'text-gray-600'
                  }`}>
                    {pct}%
                  </span>
                )}
              </button>
              {sprintStatus && (
                <SprintStatusDropdown
                  projectId={projectId}
                  sprintId={tab.id}
                  currentStatus={sprintStatus}
                />
              )}
              {/* Edit button for sprints */}
              {sprintData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSprintId(editingSprintId === tab.id ? null : tab.id);
                    setShowNewForm(false);
                  }}
                  className="p-1 rounded-md transition-all hover:bg-white/[0.06] opacity-0 group-hover/sprint:opacity-100"
                  title="Edit sprint"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 hover:text-gray-300">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}

        {/* New Sprint Button */}
        <button
          onClick={() => {
            setShowNewForm(!showNewForm);
            setEditingSprintId(null);
          }}
          className="px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wider uppercase border border-dashed border-white/[0.08] text-gray-600 hover:text-cyan-400 hover:border-cyan-500/25 hover:bg-cyan-500/[0.03] transition-all flex items-center gap-1"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14m-7-7h14" />
          </svg>
          New Sprint
        </button>
      </div>

      {/* New Sprint Form */}
      {showNewForm && (
        <div className="mb-3 max-w-md">
          <SprintEditForm
            projectId={projectId}
            onDone={() => setShowNewForm(false)}
          />
        </div>
      )}

      {/* Edit Sprint Form */}
      {editingSprintId && (() => {
        const sprint = sprints.find(s => s.id === editingSprintId);
        if (!sprint) return null;
        return (
          <div className="mb-3 max-w-md">
            <SprintEditForm
              projectId={projectId}
              sprint={sprint}
              onDone={() => setEditingSprintId(null)}
            />
          </div>
        );
      })()}

      {/* Active sprint info with progress bar */}
      {activeSprint && !editingSprintId && (
        <div className="rounded-xl glass-card px-4 py-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {activeSprint.goal && (
                <>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">Sprint Goal</p>
                  <p className="text-[12px] text-gray-400 leading-relaxed mb-2">{activeSprint.goal}</p>
                </>
              )}
              {/* Progress bar */}
              {(() => {
                const stats = sprintStats?.[activeSprint.id];
                if (!stats || stats.total === 0) return null;
                const pct = Math.round((stats.done / stats.total) * 100);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Progress</p>
                      <p className="text-[10px] font-mono tabular-nums text-gray-500">
                        {stats.done}/{stats.total} tasks · <span className={pct === 100 ? 'text-emerald-400' : 'text-cyan-400'}>{pct}%</span>
                      </p>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          pct === 100 ? 'bg-emerald-400' : 'bg-gradient-to-r from-cyan-500 to-cyan-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
            {(activeSprint.start_date || activeSprint.end_date) && (
              <div className="text-right shrink-0">
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">Duration</p>
                <p className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {activeSprint.start_date ? new Date(activeSprint.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  {' → '}
                  {activeSprint.end_date ? new Date(activeSprint.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

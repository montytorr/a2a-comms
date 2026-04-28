'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil } from 'lucide-react';
import SprintStatusDropdown from './sprint-status-dropdown';
import { formatDate } from '@/lib/format-date';
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
  sprint?: {
    id: string;
    title: string;
    start_date: string | null;
    end_date: string | null;
    goal: string | null;
  };
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
          goal || undefined
        );
      }
      onDone();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card"
      style={{ padding: 12 }}
    >
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sprint title…"
        disabled={isPending}
        className="cp-input"
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label className="upper" style={{ display: 'block', fontSize: 9, marginBottom: 6 }}>Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={isPending}
            className="cp-input"
            style={{ width: '100%', colorScheme: 'dark' }}
          />
        </div>
        <div>
          <label className="upper" style={{ display: 'block', fontSize: 9, marginBottom: 6 }}>End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={isPending}
            className="cp-input"
            style={{ width: '100%', colorScheme: 'dark' }}
          />
        </div>
      </div>
      <input
        type="text"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Sprint goal (optional)…"
        disabled={isPending}
        className="cp-input"
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" onClick={onDone} className="btn btn--ghost btn--sm">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isPending}
          className="btn btn--primary btn--sm"
        >
          {isPending ? 'Saving…' : sprint ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
}

export default function SprintSelector({
  sprints,
  currentSprintId,
  projectId,
  sprintStats,
}: SprintSelectorProps) {
  const router = useRouter();
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);

  const tabs = [
    { id: 'all', label: 'All Tasks' },
    { id: 'backlog', label: 'Backlog' },
    ...sprints.map((s) => ({ id: s.id, label: s.title, status: s.status })),
  ];

  const activeSprint = sprints.find((s) => s.id === currentSprintId);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Tab row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {tabs.map((tab) => {
          const isActive = currentSprintId === tab.id;
          const sprintStatus = 'status' in tab ? tab.status : null;
          const stats = sprintStats?.[tab.id];
          const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : null;
          const sprintData = sprints.find((s) => s.id === tab.id);

          return (
            <div
              key={tab.id}
              style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              className="group/sprint"
            >
              <button
                onClick={() => {
                  const params = tab.id === 'all' ? '' : `?sprint=${tab.id}`;
                  router.push(`/projects/${projectId}${params}`);
                }}
                className={isActive ? 'cp-tab cp-tab--active' : 'cp-tab'}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {sprintStatus && (
                  <span
                    className={`dot${sprintStatus === 'active' ? ' dot--mint' : sprintStatus === 'completed' ? ' dot--mint' : ''}`}
                  />
                )}
                {tab.label}
                {pct !== null && stats && stats.total > 0 && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      marginLeft: 2,
                      color: pct === 100 ? 'var(--mint)' : isActive ? 'var(--peri)' : 'var(--fg-4)',
                    }}
                  >
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

              {sprintData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingSprintId(editingSprintId === tab.id ? null : tab.id);
                    setShowNewForm(false);
                  }}
                  className="btn btn--ghost btn--icon"
                  title="Edit sprint"
                  style={{ opacity: 0 }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0';
                  }}
                >
                  <Pencil size={11} style={{ color: 'var(--fg-4)' }} />
                </button>
              )}
            </div>
          );
        })}

        {/* New Sprint button */}
        <button
          onClick={() => {
            setShowNewForm(!showNewForm);
            setEditingSprintId(null);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderRadius: 20,
            border: '1px dashed var(--line-1)',
            background: 'transparent',
            color: 'var(--fg-4)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'color 0.15s, border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--peri)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--peri)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--peri-bg)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line-1)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <Plus size={10} />
          New Sprint
        </button>
      </div>

      {/* New Sprint Form */}
      {showNewForm && (
        <div style={{ marginBottom: 12, maxWidth: 448 }}>
          <SprintEditForm projectId={projectId} onDone={() => setShowNewForm(false)} />
        </div>
      )}

      {/* Edit Sprint Form */}
      {editingSprintId &&
        (() => {
          const sprint = sprints.find((s) => s.id === editingSprintId);
          if (!sprint) return null;
          return (
            <div style={{ marginBottom: 12, maxWidth: 448 }}>
              <SprintEditForm
                projectId={projectId}
                sprint={sprint}
                onDone={() => setEditingSprintId(null)}
              />
            </div>
          );
        })()}

      {/* Active sprint info + progress */}
      {activeSprint && !editingSprintId && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {activeSprint.goal && (
                <>
                  <p className="upper" style={{ fontSize: 9, marginBottom: 4 }}>Sprint Goal</p>
                  <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>
                    {activeSprint.goal}
                  </p>
                </>
              )}
              {(() => {
                const stats = sprintStats?.[activeSprint.id];
                if (!stats || stats.total === 0) return null;
                const pct = Math.round((stats.done / stats.total) * 100);
                return (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <p className="upper" style={{ fontSize: 9 }}>Progress</p>
                      <p
                        className="mono"
                        style={{ fontSize: 10, color: 'var(--fg-4)' }}
                      >
                        {stats.done}/{stats.total} tasks ·{' '}
                        <span style={{ color: pct === 100 ? 'var(--mint)' : 'var(--peri)' }}>
                          {pct}%
                        </span>
                      </p>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'var(--bg-2)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 4,
                          width: `${pct}%`,
                          background: pct === 100 ? 'var(--mint)' : 'var(--peri)',
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
            {(activeSprint.start_date || activeSprint.end_date) && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="upper" style={{ fontSize: 9, marginBottom: 4 }}>Duration</p>
                <p className="mono dim" style={{ fontSize: 11 }}>
                  {activeSprint.start_date ? formatDate(activeSprint.start_date) : '—'}
                  {' → '}
                  {activeSprint.end_date ? formatDate(activeSprint.end_date) : '—'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

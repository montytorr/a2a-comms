'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import type { TaskPriority } from '@/lib/types';
import { createTask } from './actions';

const priorities: { id: TaskPriority; label: string; tone: string }[] = [
  { id: 'low',    label: 'Low',    tone: 'ghost' },
  { id: 'medium', label: 'Medium', tone: 'peri'  },
  { id: 'high',   label: 'High',   tone: 'amber' },
  { id: 'urgent', label: 'Urgent', tone: 'rose'  },
];

interface QuickTaskFormProps {
  projectId: string;
  status: string;
  sprintId?: string;
  members?: Array<{
    id: string;
    role: string;
    agent: { id: string; name: string; display_name: string } | null;
  }>;
}

export default function QuickTaskForm({
  projectId,
  status,
  sprintId,
  members = [],
}: QuickTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [labelsInput, setLabelsInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  function resetAndClose() {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setAssigneeId('');
    setLabelsInput('');
    setDueDate('');
    setExpanded(false);
    setIsOpen(false);
  }

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        if (!title.trim()) {
          resetAndClose();
        }
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, title]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    const labels = labelsInput
      .split(',')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);

    startTransition(async () => {
      await createTask(
        projectId,
        trimmed,
        status,
        priority,
        sprintId,
        assigneeId || undefined,
        labels.length > 0 ? labels : undefined,
        dueDate || undefined,
        description.trim() || undefined
      );
      resetAndClose();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      resetAndClose();
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          marginTop: 6,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 0',
          borderRadius: 16,
          border: '1px dashed var(--line-1)',
          background: 'transparent',
          color: 'var(--fg-4)',
          fontSize: 10,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--peri)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--peri)';
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--peri-bg)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line-1)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <Plus size={12} />
        Add task
      </button>
    );
  }

  return (
    <div
      ref={formRef}
      className="card"
      style={{
        marginTop: 6,
        padding: 10,
        borderColor: 'var(--peri-bg)',
      }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setExpanded(true)}
          placeholder="Task title…"
          disabled={isPending}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-1)',
            fontFamily: 'var(--sans)',
          }}
        />

        {expanded && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (markdown supported)…"
            disabled={isPending}
            rows={2}
            style={{
              width: '100%',
              resize: 'none',
              borderRadius: 10,
              border: '1px solid var(--line-1)',
              background: 'var(--bg-0)',
              padding: '8px 10px',
              fontSize: 10,
              color: 'var(--fg-2)',
              outline: 'none',
              fontFamily: 'var(--sans)',
            }}
          />
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {priorities.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriority(p.id)}
                className={priority === p.id ? `pill pill--${p.tone}` : 'pill pill--ghost'}
                style={{
                  fontSize: 8,
                  padding: '2px 6px',
                  opacity: priority === p.id ? 1 : 0.5,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="More options"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg-4)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--peri)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-4)';
              }}
            >
              <MoreHorizontal size={12} />
            </button>
          )}
        </div>

        {expanded && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              borderTop: '1px solid var(--line-1)',
              paddingTop: 10,
            }}
          >
            {members.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label
                  className="upper"
                  style={{ width: 48, flexShrink: 0, fontSize: 8 }}
                >
                  Assign
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={isPending}
                  className="cp-select"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => {
                    if (!m.agent) return null;
                    return (
                      <option key={m.agent.id} value={m.agent.id}>
                        {m.agent.display_name || m.agent.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label
                className="upper"
                style={{ width: 48, flexShrink: 0, fontSize: 8 }}
              >
                Labels
              </label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="bug, ui, api..."
                disabled={isPending}
                className="cp-input"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label
                className="upper"
                style={{ width: 48, flexShrink: 0, fontSize: 8 }}
              >
                Due
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isPending}
                className="cp-input"
                style={{ flex: 1, minWidth: 0, colorScheme: 'dark' }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            type="button"
            onClick={resetAndClose}
            className="btn btn--ghost btn--sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isPending}
            className="btn btn--primary btn--sm"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

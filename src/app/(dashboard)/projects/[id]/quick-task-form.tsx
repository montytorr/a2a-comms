'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import type { TaskPriority } from '@/lib/types';
import { createTask } from './actions';
import { pillClassForTone, taskPriorityTone } from '@/lib/status-tone';
import styles from './project-detail.module.css';

/* Third copy of the priority→colour map in the tree; the tone now comes from
   status-tone.ts, so only the label lives here. */
const priorities: { id: TaskPriority; label: string }[] = [
  { id: 'low',    label: 'Low'    },
  { id: 'medium', label: 'Medium' },
  { id: 'high',   label: 'High'   },
  { id: 'urgent', label: 'Urgent' },
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
      <button type="button" onClick={() => setIsOpen(true)} className={styles.addTask}>
        <Plus size={12} aria-hidden />
        Add task
      </button>
    );
  }

  return (
    <div
      ref={formRef}
      className={`card ${styles.addTaskForm}`}
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
          className="text-2xs" style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            
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
            className="cp-textarea text-2xs" style={{
              width: '100%',
              resize: 'none',
              borderRadius: 'var(--radius-2)',
              border: '1px solid var(--line-1)',
              background: 'var(--bg-0)',
              padding: 'var(--space-2) var(--space-3)',
              
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
                className={`text-2xs ${pillClassForTone(priority === p.id ? taskPriorityTone(p.id) : 'neutral')}`}
                style={{
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
                  className="upper text-2xs"
                  style={{ width: 48, flexShrink: 0 }}
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
                className="upper text-2xs"
                style={{ width: 48, flexShrink: 0 }}
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
                className="upper text-2xs"
                style={{ width: 48, flexShrink: 0 }}
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

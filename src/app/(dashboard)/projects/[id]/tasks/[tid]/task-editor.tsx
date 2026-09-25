'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskPriority } from '@/lib/types';
import MarkdownPreview from '@/components/markdown-preview';
import styles from './task-editor.module.css';
import { Avatar } from '@/components/atoms';
import { updateTask, deleteTask } from './actions';
import { useRouter } from 'next/navigation';
import { dotClassForTone, statusTone } from '@/lib/status-tone';

const priorityOptions: { id: TaskPriority; label: string; varColor: string }[] = [
  { id: 'urgent', label: 'Urgent', varColor: 'var(--rose)' },
  { id: 'high',   label: 'High',   varColor: 'var(--amber)' },
  { id: 'medium', label: 'Medium', varColor: 'var(--peri)' },
  { id: 'low',    label: 'Low',    varColor: 'var(--fg-3)' },
];

// ----- Inline Editable Title -----
function EditableTitle({
  value,
  projectId,
  taskId,
}: {
  value: string;
  projectId: string;
  taskId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === value) {
      setText(value);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateTask(projectId, taskId, { title: trimmed });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <h1
        className={`h1 ${styles.editable} ${styles.editableTitle}`}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); }
        }}
        aria-label={`Edit task title: ${value}`}
        title="Click to edit"
      >
        {value}
      </h1>
    );
  }

  return (
    <input
      ref={inputRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { setText(value); setEditing(false); }
      }}
      disabled={isPending}
      className="text-2xl" style={{
        
        fontWeight: 600,
        color: 'var(--fg-0)',
        letterSpacing: '-0.02em',
        marginBottom: 0,
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius-2)',
        padding: '4px 6px',
        marginLeft: -6,
        outline: 'none',
        border: '1px solid var(--brand)',
        boxShadow: '0 0 0 3px var(--focus-ring)',
        width: 'calc(100% + 12px)',
        fontFamily: 'inherit',
      }}
    />
  );
}

// ----- Editable Description -----
function EditableDescription({
  value,
  projectId,
  taskId,
}: {
  value: string | null;
  projectId: string;
  taskId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  function save() {
    const newVal = text.trim() || null;
    if (newVal === (value || null)) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await updateTask(projectId, taskId, { description: newVal });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div
        className={`${styles.editable} ${styles.editableBody}`}
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); }
        }}
        aria-label={value ? 'Edit description' : 'Add a description'}
        title="Click to edit description"
      >
        {value ? (
          <MarkdownPreview content={value} />
        ) : (
          <p className={styles.descriptionEmpty}>Add a description</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setText(value || ''); setEditing(false); }
        }}
        disabled={isPending}
        placeholder="Write description (markdown supported)…"
        className="cp-textarea text-sm" style={{
          width: '100%',
          background: 'var(--bg-2)',
          
          color: 'var(--fg-1)',
          lineHeight: 1.6,
          borderRadius: 'var(--radius-2)',
          padding: 'var(--space-2)',
          outline: 'none',
          border: '1px solid var(--brand)',
          boxShadow: '0 0 0 3px var(--focus-ring)',
          resize: 'none',
          minHeight: 80,
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onClick={() => { setText(value || ''); setEditing(false); }}
          className="btn btn--ghost btn--sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="btn btn--primary btn--sm"
          style={{ opacity: isPending ? 0.3 : 1 }}
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ----- Assignee Picker -----
function AssigneePicker({
  currentId,
  members,
  projectId,
  taskId,
}: {
  currentId: string | null;
  members: Array<{ agent: { id: string; name: string; display_name: string } | null }>;
  projectId: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleSelect(agentId: string | null) {
    startTransition(async () => {
      await updateTask(projectId, taskId, { assignee_agent_id: agentId });
      setOpen(false);
    });
  }

  const current = members.find(m => m.agent?.id === currentId)?.agent;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className={styles.fieldButton}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current ? (
          <>
            <Avatar name={current.display_name || current.name} size={24} />
            <span className="text-sm" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{current.display_name || current.name}</span>
          </>
        ) : (
          <span className={styles.fieldPlaceholder}>Unassigned — click to assign</span>
        )}
        {isPending && <span className="text-2xs" style={{ color: 'var(--fg-3)', marginLeft: 'auto' }}>…</span>}
      </button>

      {open && (
        <div className={`animate-fade-in ${styles.menu}`} role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={currentId == null}
            onClick={() => handleSelect(null)}
            className={styles.menuItem}
          >
            <span className={styles.menuAvatarNone} aria-hidden="true">—</span>
            Unassigned
          </button>
          {members.map((m) => {
            if (!m.agent) return null;
            const name = m.agent.display_name || m.agent.name;
            const isSelected = m.agent.id === currentId;
            return (
              <button
                key={m.agent.id}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => handleSelect(m.agent!.id)}
                className={styles.menuItem}
              >
                <Avatar name={name} size={24} />
                {name}
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.menuItemCheck} aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----- Labels Editor -----
function LabelsEditor({
  labels,
  projectId,
  taskId,
}: {
  labels: string[];
  projectId: string;
  taskId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function addLabel() {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || labels.includes(trimmed)) { setInput(''); return; }
    startTransition(async () => {
      await updateTask(projectId, taskId, { labels: [...labels, trimmed] });
      setInput('');
    });
  }

  function removeLabel(label: string) {
    startTransition(async () => {
      await updateTask(projectId, taskId, { labels: labels.filter(l => l !== label) });
    });
  }

  return (
    <div>
      {labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
          {labels.map((label) => (
            <span key={label} className={`pill pill--peri ${styles.labelPill}`}>
              {label}
              <button
                type="button"
                onClick={() => removeLabel(label)}
                disabled={isPending}
                className={styles.labelRemove}
                aria-label={`Remove label ${label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {editing ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addLabel(); }
              if (e.key === 'Escape') { setInput(''); setEditing(false); }
            }}
            placeholder="Label name…"
            disabled={isPending}
            className="cp-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={addLabel}
            disabled={!input.trim() || isPending}
            className="btn btn--sm btn--primary"
            style={{ opacity: !input.trim() || isPending ? 0.35 : 1 }}
          >
            Add
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="btn btn--ghost btn--sm">
          + Add label
        </button>
      )}
    </div>
  );
}

// ----- Due Date Picker -----
function DueDatePicker({
  value,
  projectId,
  taskId,
  isOverdue,
}: {
  value: string | null;
  projectId: string;
  taskId: string;
  isOverdue: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(dateStr: string) {
    startTransition(async () => {
      await updateTask(projectId, taskId, { due_date: dateStr || null });
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="date"
        value={value?.split('T')[0] || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="cp-input"
        style={{
          width: 'auto',
          colorScheme: 'dark',
          color: isOverdue ? 'var(--rose)' : 'var(--fg-1)',
        }}
      />
      {value && (
        <button
          onClick={() => handleChange('')}
          disabled={isPending}
          className="btn btn--ghost btn--sm text-2xs"
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--rose)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = ''; }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ----- Priority Picker -----
function PriorityPicker({
  value,
  projectId,
  taskId,
}: {
  value: string;
  projectId: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const current = priorityOptions.find(p => p.id === value) || priorityOptions[2];

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="pill"
        style={{
          cursor: 'pointer',
          color: current.varColor,
        }}
      >
        <span className="dot" style={{ background: current.varColor }} />
        <span>{current.label} priority</span>
      </button>

      {open && (
        <div className={`animate-fade-in ${styles.menu}`} role="menu" style={{ minWidth: 160 }}>
          {priorityOptions.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if (p.id !== value) {
                  startTransition(async () => {
                    await updateTask(projectId, taskId, { priority: p.id });
                    setOpen(false);
                  });
                } else {
                  setOpen(false);
                }
              }}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === value}
              className={styles.menuItem}
              style={p.id === value ? { color: p.varColor } : undefined}
            >
              <span className="dot" style={{ background: p.varColor }} />
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              {p.id === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.menuItemCheck} aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Sprint Picker -----
function SprintPicker({
  currentSprintId,
  sprints,
  projectId,
  taskId,
}: {
  currentSprintId: string | null;
  sprints: Array<{ id: string; title: string; status: string }>;
  projectId: string;
  taskId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const current = sprints.find(s => s.id === currentSprintId);

  /* Sprint status, from the shared map. `planned` used to fall through to the
     grey dot, which made it indistinguishable from a sprint with no status. */
  function sprintDotClass(status: string) {
    return dotClassForTone(statusTone('sprint', status));
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          marginLeft: -8,
          borderRadius: 'var(--radius-2)',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span className="text-xs" style={{ color: 'var(--fg-1)', fontWeight: 500 }}>{current?.title || 'Backlog'}</span>
      </button>

      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: 180,
            borderRadius: 'var(--radius-3)',
            border: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px var(--scrim)',
          }}
        >
          <button
            onClick={() => {
              if (currentSprintId !== null) {
                startTransition(async () => {
                  await updateTask(projectId, taskId, { sprint_id: null });
                  setOpen(false);
                });
              } else {
                setOpen(false);
              }
            }}
            className="text-2xs" style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              textAlign: 'left',
              
              color: !currentSprintId ? 'var(--brand)' : 'var(--fg-2)',
              background: !currentSprintId ? 'var(--bg-3)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { if (currentSprintId) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; } }}
            onMouseLeave={e => { if (currentSprintId) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; } }}
          >
            Backlog
            {!currentSprintId && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
          {sprints.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                if (s.id !== currentSprintId) {
                  startTransition(async () => {
                    await updateTask(projectId, taskId, { sprint_id: s.id });
                    setOpen(false);
                  });
                } else {
                  setOpen(false);
                }
              }}
              className="text-2xs" style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                textAlign: 'left',
                
                color: s.id === currentSprintId ? 'var(--brand)' : 'var(--fg-2)',
                background: s.id === currentSprintId ? 'var(--bg-3)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (s.id !== currentSprintId) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; } }}
              onMouseLeave={e => { if (s.id !== currentSprintId) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; } }}
            >
              <span className={sprintDotClass(s.status)} />
              {s.title}
              {s.id === currentSprintId && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Delete Task Button -----
function DeleteTaskButton({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm('Delete this task? This action cannot be undone.')) return;
    startTransition(async () => {
      await deleteTask(projectId, taskId);
      router.push(`/projects/${projectId}`);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="btn btn--ghost btn--sm"
      style={{ color: 'var(--rose)', opacity: isPending ? 0.35 : 1 }}
    >
      {isPending ? 'Deleting…' : 'Delete task'}
    </button>
  );
}

// ----- Main Exports -----
export {
  EditableTitle,
  EditableDescription,
  AssigneePicker,
  LabelsEditor,
  DueDatePicker,
  PriorityPicker,
  SprintPicker,
  DeleteTaskButton,
};

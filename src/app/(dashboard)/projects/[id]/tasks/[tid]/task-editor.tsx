'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskPriority } from '@/lib/types';
import MarkdownPreview from '@/components/markdown-preview';
import { updateTask, deleteTask } from './actions';
import { useRouter } from 'next/navigation';

const priorityOptions: { id: TaskPriority; label: string; icon: string; varColor: string }[] = [
  { id: 'urgent', label: 'Urgent', icon: '🔴', varColor: 'var(--rose)' },
  { id: 'high',   label: 'High',   icon: '🟠', varColor: 'var(--amber)' },
  { id: 'medium', label: 'Medium', icon: '🔵', varColor: 'var(--peri)' },
  { id: 'low',    label: 'Low',    icon: '⚪', varColor: 'var(--fg-3)' },
];

const avatarColors: string[] = [
  'var(--mint)',
  'var(--peri)',
  'var(--mint-2)',
  'var(--amber)',
  'var(--rose)',
  'var(--amber-2)',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarColors.length;
}

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
        onClick={() => setEditing(true)}
        className="h1"
        style={{
          cursor: 'pointer',
          marginBottom: 12,
          padding: '4px 6px',
          marginLeft: -6,
          borderRadius: 6,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
      style={{
        fontSize: 28,
        fontWeight: 600,
        color: 'var(--fg-0)',
        letterSpacing: '-0.02em',
        marginBottom: 12,
        background: 'var(--bg-2)',
        borderRadius: 6,
        padding: '4px 6px',
        marginLeft: -6,
        outline: 'none',
        border: '1px solid var(--amber)',
        boxShadow: '0 0 0 3px oklch(0.70 0.16 60 / 0.15)',
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
        onClick={() => setEditing(true)}
        style={{
          cursor: 'pointer',
          borderRadius: 6,
          padding: 8,
          margin: -8,
          minHeight: 40,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        title="Click to edit description"
      >
        {value ? (
          <MarkdownPreview content={value} />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--fg-4)', fontStyle: 'italic' }}>Click to add description…</p>
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
        style={{
          width: '100%',
          background: 'var(--bg-2)',
          fontSize: 13,
          color: 'var(--fg-1)',
          lineHeight: 1.6,
          borderRadius: 6,
          padding: 8,
          outline: 'none',
          border: '1px solid var(--amber)',
          boxShadow: '0 0 0 3px oklch(0.70 0.16 60 / 0.15)',
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          marginLeft: -8,
          borderRadius: 6,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        {current ? (
          <>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--bg-3)',
              border: `1px solid ${avatarColors[getAvatarIndex(current.display_name || current.name)]}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: avatarColors[getAvatarIndex(current.display_name || current.name)],
              flexShrink: 0,
            }}>
              {(current.display_name || current.name)[0]?.toUpperCase()}
            </div>
            <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{current.display_name || current.name}</span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--fg-4)', fontStyle: 'italic' }}>Unassigned — click to assign</span>
        )}
        {isPending && <span style={{ fontSize: 10, color: 'var(--fg-3)', marginLeft: 'auto' }}>…</span>}
      </button>

      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: 200,
            maxHeight: 220,
            overflowY: 'auto',
            borderRadius: 8,
            border: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px oklch(0.05 0.01 250 / 0.8)',
          }}
        >
          <button
            onClick={() => handleSelect(null)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              textAlign: 'left',
              fontSize: 11,
              color: 'var(--fg-3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--fg-3)',
            }}>—</span>
            Unassigned
          </button>
          {members.map((m) => {
            if (!m.agent) return null;
            const name = m.agent.display_name || m.agent.name;
            const isSelected = m.agent.id === currentId;
            const avatarColor = avatarColors[getAvatarIndex(name)];
            return (
              <button
                key={m.agent.id}
                onClick={() => handleSelect(m.agent!.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  color: isSelected ? 'var(--amber)' : 'var(--fg-2)',
                  background: isSelected ? 'var(--bg-3)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; } }}
                onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; } }}
              >
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-3)',
                  border: `1px solid ${avatarColor}`, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 9, fontWeight: 700, color: avatarColor, flexShrink: 0,
                }}>
                  {name[0]?.toUpperCase()}
                </div>
                {name}
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {labels.map((label) => (
          <span
            key={label}
            className="pill pill--peri"
            style={{ gap: 4 }}
          >
            {label}
            <button
              onClick={() => removeLabel(label)}
              disabled={isPending}
              style={{
                color: 'var(--peri)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                lineHeight: 1,
                padding: 0,
                opacity: 0,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--rose)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--peri)';
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
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
        <button
          onClick={() => setEditing(true)}
          style={{
            fontSize: 10,
            color: 'var(--fg-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--amber)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)'; }}
        >
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
          className="btn btn--ghost btn--sm"
          style={{ fontSize: 10 }}
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          marginLeft: -8,
          borderRadius: 6,
          cursor: 'pointer',
          color: current.varColor,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span>{current.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{current.label}</span>
      </button>

      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 50,
            minWidth: 140,
            borderRadius: 8,
            border: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px oklch(0.05 0.01 250 / 0.8)',
          }}
        >
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
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: 11,
                color: p.id === value ? p.varColor : 'var(--fg-2)',
                background: p.id === value ? 'var(--bg-3)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (p.id !== value) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; } }}
              onMouseLeave={e => { if (p.id !== value) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; } }}
            >
              <span>{p.icon}</span>
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              {p.id === value && (
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

  function sprintDotClass(status: string) {
    if (status === 'active') return 'dot dot--amber';
    if (status === 'completed') return 'dot dot--mint';
    return 'dot';
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
          borderRadius: 6,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 12, color: 'var(--fg-1)', fontWeight: 500 }}>{current?.title || 'Backlog'}</span>
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
            borderRadius: 8,
            border: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px oklch(0.05 0.01 250 / 0.8)',
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
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              textAlign: 'left',
              fontSize: 11,
              color: !currentSprintId ? 'var(--amber)' : 'var(--fg-2)',
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
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: 11,
                color: s.id === currentSprintId ? 'var(--amber)' : 'var(--fg-2)',
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
      className="btn btn--danger"
      style={{
        width: '100%',
        marginTop: 8,
        justifyContent: 'center',
        opacity: isPending ? 0.35 : 1,
      }}
    >
      {isPending ? 'Deleting…' : 'Delete Task'}
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

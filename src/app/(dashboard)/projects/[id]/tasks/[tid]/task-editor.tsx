'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskPriority } from '@/lib/types';
import MarkdownPreview from '@/components/markdown-preview';
import { updateTask, deleteTask } from './actions';
import { useRouter } from 'next/navigation';

const priorityOptions: { id: TaskPriority; label: string; icon: string; color: string }[] = [
  { id: 'urgent', label: 'Urgent', icon: '🔴', color: 'text-red-400' },
  { id: 'high', label: 'High', icon: '🟠', color: 'text-orange-400' },
  { id: 'medium', label: 'Medium', icon: '🔵', color: 'text-blue-400' },
  { id: 'low', label: 'Low', icon: '⚪', color: 'text-gray-500' },
];

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
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
        className="text-[24px] font-bold text-white tracking-tight mb-3 cursor-pointer hover:bg-white/[0.03] rounded-lg px-1 -mx-1 transition-colors"
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
      className="text-[24px] font-bold text-white tracking-tight mb-3 bg-white/[0.03] rounded-lg px-1 -mx-1 outline-none ring-1 ring-cyan-500/30 w-full"
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
        className="cursor-pointer hover:bg-white/[0.02] rounded-lg p-2 -m-2 transition-colors min-h-[40px]"
        title="Click to edit description"
      >
        {value ? (
          <MarkdownPreview content={value} />
        ) : (
          <p className="text-[13px] text-gray-600 italic">Click to add description…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
        className="w-full bg-white/[0.03] text-[13px] text-gray-300 leading-relaxed rounded-lg p-2 outline-none ring-1 ring-cyan-500/30 resize-none placeholder-gray-600 min-h-[80px]"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => { setText(value || ''); setEditing(false); }}
          className="px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 transition-all"
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-2 hover:bg-white/[0.04] rounded-lg px-2 py-1 -mx-2 transition-colors w-full text-left"
      >
        {current ? (
          <>
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(current.display_name || current.name)]} flex items-center justify-center text-[9px] font-bold text-white`}>
              {(current.display_name || current.name)[0]?.toUpperCase()}
            </div>
            <span className="text-[13px] text-gray-300 font-medium">{current.display_name || current.name}</span>
          </>
        ) : (
          <span className="text-[12px] text-gray-600 italic">Unassigned — click to assign</span>
        )}
        {isPending && <span className="text-[10px] text-gray-500 ml-auto">…</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[220px] overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl animate-fade-in">
          <button
            onClick={() => handleSelect(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-gray-500 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-gray-500">—</span>
            Unassigned
          </button>
          {members.map((m) => {
            if (!m.agent) return null;
            const name = m.agent.display_name || m.agent.name;
            const isSelected = m.agent.id === currentId;
            return (
              <button
                key={m.agent.id}
                onClick={() => handleSelect(m.agent!.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${
                  isSelected ? 'text-cyan-400 bg-white/[0.04]' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradients[getAvatarIndex(name)]} flex items-center justify-center text-[9px] font-bold text-white`}>
                  {name[0]?.toUpperCase()}
                </div>
                {name}
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto">
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
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {labels.map((label) => (
          <span key={label} className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-400 bg-violet-500/[0.08] px-2 py-0.5 rounded-full border border-violet-500/10 group/label">
            {label}
            <button
              onClick={() => removeLabel(label)}
              disabled={isPending}
              className="opacity-0 group-hover/label:opacity-100 text-violet-400 hover:text-red-400 transition-all text-[8px] leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {editing ? (
        <div className="flex gap-1">
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
            className="flex-1 bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none"
          />
          <button
            onClick={addLabel}
            disabled={!input.trim() || isPending}
            className="px-2 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 transition-all"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-gray-600 hover:text-cyan-400 transition-colors"
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
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value?.split('T')[0] || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className={`bg-white/[0.03] text-[12px] rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none [color-scheme:dark] ${
          isOverdue ? 'text-red-400' : 'text-gray-300'
        }`}
      />
      {value && (
        <button
          onClick={() => handleChange('')}
          disabled={isPending}
          className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className={`flex items-center gap-1.5 hover:bg-white/[0.04] rounded-lg px-2 py-1 -mx-2 transition-colors ${current.color}`}
      >
        <span>{current.icon}</span>
        <span className="text-[12px] font-medium capitalize">{current.label}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl animate-fade-in">
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
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${
                p.id === value ? `${p.color} bg-white/[0.04]` : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span>{p.icon}</span>
              <span className="font-medium">{p.label}</span>
              {p.id === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto">
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-1.5 hover:bg-white/[0.04] rounded-lg px-2 py-1 -mx-2 transition-colors w-full text-left"
      >
        <span className="text-[12px] text-gray-300 font-medium">{current?.title || 'Backlog'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl animate-fade-in">
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
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${
              !currentSprintId ? 'text-cyan-400 bg-white/[0.04]' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            Backlog
            {!currentSprintId && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto">
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
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors ${
                s.id === currentSprintId ? 'text-cyan-400 bg-white/[0.04]' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'active' ? 'bg-cyan-400' : s.status === 'completed' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
              {s.title}
              {s.id === currentSprintId && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-auto">
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
      className="w-full mt-2 py-2 rounded-xl border border-red-500/15 text-[11px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.06] hover:border-red-500/25 transition-all disabled:opacity-30"
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

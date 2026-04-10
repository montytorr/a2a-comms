'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskPriority } from '@/lib/types';
import { createTask } from './actions';

const priorities: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: 'text-gray-500' },
  { id: 'medium', label: 'Medium', color: 'text-blue-400' },
  { id: 'high', label: 'High', color: 'text-orange-400' },
  { id: 'urgent', label: 'Urgent', color: 'text-red-400' },
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

export default function QuickTaskForm({ projectId, status, sprintId, members = [] }: QuickTaskFormProps) {
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
      .map(l => l.trim().toLowerCase())
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
        description.trim() || undefined,
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
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/[0.07] bg-black/10 py-2.5 text-[10px] font-medium text-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-cyan-500/20 hover:bg-cyan-500/[0.05] hover:text-cyan-300"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14m-7-7h14" />
        </svg>
        Add task
      </button>
    );
  }

  return (
    <div ref={formRef} className="mt-1.5 overflow-hidden rounded-2xl border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(34,211,238,0.08),rgba(255,255,255,0.025)_34%,rgba(255,255,255,0.01))] p-2.5 shadow-[0_14px_32px_rgba(0,0,0,0.22)] ring-1 ring-inset ring-white/[0.03] animate-fade-in">
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setExpanded(true)}
          placeholder="Task title…"
          disabled={isPending}
          className="w-full bg-transparent text-[11px] font-medium text-white placeholder-gray-500 outline-none"
        />

        {expanded && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (markdown supported)…"
            disabled={isPending}
            rows={2}
            className="w-full resize-none rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-2 text-[10px] text-gray-200 outline-none placeholder-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] focus:border-cyan-400/30"
          />
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {priorities.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriority(p.id)}
                className={`rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] transition-all ${
                  priority === p.id
                    ? `${p.color} bg-white/[0.07] ring-1 ring-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`
                    : 'text-gray-600 hover:text-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[9px] text-gray-500 transition-colors hover:text-cyan-300"
              title="More options"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          )}
        </div>

        {expanded && (
          <div className="space-y-2 border-t border-white/[0.05] pt-2.5 animate-fade-in">
            {members.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="w-12 shrink-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-500">Assign</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={isPending}
                  className="min-w-0 flex-1 cursor-pointer appearance-none rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[10px] text-gray-200 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] focus:border-cyan-400/30"
                >
                  <option value="" className="bg-[#111118]">Unassigned</option>
                  {members.map((m) => {
                    if (!m.agent) return null;
                    return (
                      <option key={m.agent.id} value={m.agent.id} className="bg-[#111118]">
                        {m.agent.display_name || m.agent.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label className="w-12 shrink-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-500">Labels</label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="bug, ui, api..."
                disabled={isPending}
                className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[10px] text-gray-200 outline-none placeholder-gray-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] focus:border-cyan-400/30"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="w-12 shrink-0 text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-500">Due</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isPending}
                className="min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[10px] text-gray-200 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] focus:border-cyan-400/30 [color-scheme:dark]"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-md px-2 py-1 text-[9px] text-gray-500 transition-colors hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isPending}
            className="rounded-md border border-cyan-400/15 bg-cyan-500/15 px-2.5 py-1 text-[9px] font-semibold text-cyan-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

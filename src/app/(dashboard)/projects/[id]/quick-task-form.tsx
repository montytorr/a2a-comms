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
        className="w-full mt-2 py-2 rounded-xl border border-dashed border-white/[0.06] hover:border-cyan-500/20 hover:bg-cyan-500/[0.03] transition-all text-[11px] text-gray-600 hover:text-cyan-400 flex items-center justify-center gap-1.5"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14m-7-7h14" />
        </svg>
        Add task
      </button>
    );
  }

  return (
    <div ref={formRef} className="mt-2 rounded-xl border border-cyan-500/20 bg-white/[0.02] p-3 animate-fade-in overflow-hidden">
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setExpanded(true)}
          placeholder="Task title…"
          disabled={isPending}
          className="w-full bg-transparent text-[12px] text-white placeholder-gray-600 outline-none mb-2"
        />

        {expanded && (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (markdown supported)…"
            disabled={isPending}
            rows={2}
            className="w-full bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1.5 border border-white/[0.06] focus:border-cyan-500/30 outline-none placeholder-gray-600 resize-none mb-2"
          />
        )}

        {/* Priority row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex gap-1">
            {priorities.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriority(p.id)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider transition-all ${
                  priority === p.id
                    ? `${p.color} bg-white/[0.06] ring-1 ring-white/[0.1]`
                    : 'text-gray-600 hover:text-gray-400'
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
              className="text-[9px] text-gray-600 hover:text-cyan-400 transition-colors"
              title="More options"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          )}
        </div>

        {/* Expanded fields */}
        {expanded && (
          <div className="space-y-2 mb-2 pt-1 border-t border-white/[0.04] animate-fade-in">
            {/* Assignee dropdown */}
            {members.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold w-14 shrink-0">Assign</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={isPending}
                  className="flex-1 min-w-0 bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none appearance-none cursor-pointer"
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

            {/* Labels */}
            <div className="flex items-center gap-2">
              <label className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold w-14 shrink-0">Labels</label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="bug, ui, api..."
                disabled={isPending}
                className="flex-1 min-w-0 bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none placeholder-gray-600"
              />
            </div>

            {/* Due date */}
            <div className="flex items-center gap-2">
              <label className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold w-14 shrink-0">Due</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isPending}
                className="flex-1 min-w-0 bg-white/[0.03] text-[11px] text-gray-300 rounded-md px-2 py-1 border border-white/[0.06] focus:border-cyan-500/30 outline-none [color-scheme:dark]"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={resetAndClose}
            className="px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isPending}
            className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
}

export default function QuickTaskForm({ projectId, status, sprintId }: QuickTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        if (!title.trim()) {
          setIsOpen(false);
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

    startTransition(async () => {
      await createTask(projectId, trimmed, status, priority, sprintId);
      setTitle('');
      setPriority('medium');
      setIsOpen(false);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setTitle('');
      setIsOpen(false);
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
    <div ref={formRef} className="mt-2 rounded-xl border border-cyan-500/20 bg-white/[0.02] p-3 animate-fade-in">
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Task title…"
          disabled={isPending}
          className="w-full bg-transparent text-[12px] text-white placeholder-gray-600 outline-none mb-2"
        />
        <div className="flex items-center justify-between gap-2">
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
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTitle('');
                setIsOpen(false);
              }}
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
        </div>
      </form>
    </div>
  );
}

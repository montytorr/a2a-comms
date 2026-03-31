'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskStatus } from '@/lib/types';
import { updateTaskStatus } from '../../actions';

const statusConfig: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  backlog: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
  todo: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', dot: 'bg-blue-400' },
  'in-progress': { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  'in-review': { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400' },
  done: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelled: { bg: 'bg-red-500/[0.08]', text: 'text-red-400', dot: 'bg-red-400' },
};

const allStatuses: TaskStatus[] = ['backlog', 'todo', 'in-progress', 'in-review', 'done', 'cancelled'];

interface TaskStatusDropdownProps {
  projectId: string;
  taskId: string;
  currentStatus: string;
}

export default function TaskStatusDropdown({ projectId, taskId, currentStatus }: TaskStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const sc = statusConfig[currentStatus as TaskStatus] || statusConfig.backlog;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleSelect(status: TaskStatus) {
    if (status === currentStatus) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await updateTaskStatus(projectId, taskId, status);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase transition-all cursor-pointer hover:ring-1 hover:ring-white/[0.1] ${sc.bg} ${sc.text} ${isPending ? 'opacity-50' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${isPending ? 'animate-pulse' : ''}`} />
        {isPending ? 'Updating…' : currentStatus}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-[160px] rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-fade-in">
          {allStatuses.map((status) => {
            const sOpt = statusConfig[status];
            const isSelected = status === currentStatus;
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-medium transition-colors ${
                  isSelected
                    ? `${sOpt.text} bg-white/[0.04]`
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${sOpt.dot}`} />
                <span className="uppercase tracking-wider font-semibold">{status}</span>
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

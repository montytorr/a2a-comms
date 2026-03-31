'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { SprintStatus } from '@/lib/types';
import { updateSprintStatus } from './actions';

const statusConfig: Record<SprintStatus, { bg: string; text: string; dot: string }> = {
  planned: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
  active: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  completed: { bg: 'bg-emerald-500/[0.06]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
};

const allStatuses: SprintStatus[] = ['planned', 'active', 'completed'];

interface SprintStatusDropdownProps {
  projectId: string;
  sprintId: string;
  currentStatus: string;
}

export default function SprintStatusDropdown({ projectId, sprintId, currentStatus }: SprintStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

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

  function handleSelect(status: SprintStatus) {
    if (status === currentStatus) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await updateSprintStatus(projectId, sprintId, status);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        disabled={isPending}
        className={`p-1 rounded-md transition-all hover:bg-white/[0.06] ${isPending ? 'opacity-50' : 'opacity-0 group-hover/sprint:opacity-100'}`}
        title="Change sprint status"
      >
        {isPending ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 animate-spin">
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M6.34 6.34L3.51 3.51" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 hover:text-gray-300">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[150px] rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="px-3 py-1.5 border-b border-white/[0.04]">
            <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Sprint Status</span>
          </div>
          {allStatuses.map((status) => {
            const sOpt = statusConfig[status];
            const isSelected = status === currentStatus;
            return (
              <button
                key={status}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(status);
                }}
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

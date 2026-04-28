'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskStatus } from '@/lib/types';
import { updateTaskStatus } from '../../actions';

type StatusMeta = { dotClass: string; pillClass: string; textColor: string };

const statusMeta: Record<TaskStatus, StatusMeta> = {
  backlog:      { dotClass: '',           pillClass: 'pill',           textColor: 'var(--fg-3)' },
  todo:         { dotClass: 'dot--peri',  pillClass: 'pill pill--peri', textColor: 'var(--peri)' },
  'in-progress':{ dotClass: 'dot--amber', pillClass: 'pill pill--amber', textColor: 'var(--amber)' },
  'in-review':  { dotClass: 'dot--amber', pillClass: 'pill pill--amber', textColor: 'var(--amber)' },
  done:         { dotClass: 'dot--mint',  pillClass: 'pill pill--mint', textColor: 'var(--mint)' },
  cancelled:    { dotClass: 'dot--rose',  pillClass: 'pill pill--rose', textColor: 'var(--rose)' },
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

  const meta = statusMeta[currentStatus as TaskStatus] || statusMeta.backlog;

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
        className={meta.pillClass}
        style={{ cursor: 'pointer', opacity: isPending ? 0.5 : 1 }}
      >
        <span className={`dot ${meta.dotClass} ${isPending ? 'pulse' : ''}`} />
        {isPending ? 'Updating…' : currentStatus}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            minWidth: 160,
            borderRadius: 8,
            border: '1px solid var(--line-1)',
            background: 'var(--bg-1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px oklch(0.05 0.01 250 / 0.8)',
            overflow: 'hidden',
          }}
        >
          {allStatuses.map((status) => {
            const opt = statusMeta[status];
            const isSelected = status === currentStatus;
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  background: isSelected ? 'var(--bg-3)' : 'transparent',
                  color: isSelected ? opt.textColor : 'var(--fg-2)',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-0)'; } }}
                onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-2)'; } }}
              >
                <span className={`dot ${opt.dotClass}`} />
                <span>{status}</span>
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

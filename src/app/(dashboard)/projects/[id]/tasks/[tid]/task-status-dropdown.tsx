'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import type { TaskStatus } from '@/lib/types';
import { updateTaskStatus } from '../../actions';
import menu from './task-editor.module.css';
import {
  colorVarForTone,
  dotClassForTone,
  pillClassForTone,
  statusLabel,
  statusTone,
  statusesOf,
} from '@/lib/status-tone';

/* The trigger is a <button>, so it cannot be a <StatusBadge> — but it takes
   its pill and dot classes from the same module the badge does, which is the
   point. This file used to hold its own task-status map, and it disagreed with
   /tasks on `in-progress` and had no row for the status /tasks called
   `blocked`. */
const allStatuses = statusesOf('task') as TaskStatus[];

interface TaskStatusDropdownProps {
  projectId: string;
  taskId: string;
  currentStatus: string;
}

export default function TaskStatusDropdown({ projectId, taskId, currentStatus }: TaskStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const tone = statusTone('task', currentStatus);

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
        className={pillClassForTone(tone)}
        style={{ cursor: 'pointer', opacity: isPending ? 0.5 : 1 }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`${dotClassForTone(tone)} ${isPending ? 'pulse' : ''}`} />
        {isPending ? 'Updating…' : statusLabel(currentStatus)}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={`animate-fade-in ${menu.menu}`} role="menu" style={{ minWidth: 176 }}>
          {allStatuses.map((status) => {
            const optTone = statusTone('task', status);
            const isSelected = status === currentStatus;
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                className={menu.menuItem}
                style={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  ...(isSelected ? { color: colorVarForTone(optTone) } : null),
                }}
              >
                <span className={dotClassForTone(optTone)} />
                <span>{statusLabel(status)}</span>
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={menu.menuItemCheck} aria-hidden="true">
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

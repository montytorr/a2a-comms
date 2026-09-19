'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { ProjectStatus } from '@/lib/types';
import { updateProjectStatus } from './actions';
import {
  dotClassForTone,
  pillClassForTone,
  statusLabel,
  statusTone,
  statusesOf,
  tonePulses,
} from '@/lib/status-tone';

/* This map used to paint `active` and `completed` the same mint, so the control
   could not tell you whether the project was finished — while /projects painted
   `planning` and `active` the same amber, so it could not tell you whether it
   had started. Both now read from status-tone.ts. */
const allStatuses = statusesOf('project') as ProjectStatus[];

interface ProjectStatusDropdownProps {
  projectId: string;
  currentStatus: string;
}

export default function ProjectStatusDropdown({ projectId, currentStatus }: ProjectStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const tone = statusTone('project', currentStatus);

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

  function handleSelect(status: ProjectStatus) {
    if (status === currentStatus) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await updateProjectStatus(projectId, status);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className={pillClassForTone(tone)}
        style={{ opacity: isPending ? 0.5 : 1, cursor: 'pointer' }}
      >
        <span
          className={`${dotClassForTone(tone)}${!isPending && tonePulses(tone) ? ' pulse' : ''}`}
          style={isPending ? { animation: 'pulse 1s infinite' } : undefined}
        />
        {isPending ? 'Updating…' : statusLabel(currentStatus)}
        <ChevronDown
          size={10}
          style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 50,
            minWidth: 160,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {allStatuses.map((status) => {
            const optTone = statusTone('project', status);
            const isSelected = status === currentStatus;
            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                className="text-2xs" style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  textAlign: 'left',
                  
                  fontWeight: 600,
                  background: isSelected ? 'var(--bg-2)' : 'transparent',
                  color: isSelected ? 'var(--fg-1)' : 'var(--fg-3)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-2)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-3)';
                  }
                }}
              >
                <span className={dotClassForTone(optTone)} />
                <span className="upper text-2xs">{statusLabel(status)}</span>
                {isSelected && <Check size={12} style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

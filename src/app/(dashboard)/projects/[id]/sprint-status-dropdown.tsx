'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { Settings, Check } from 'lucide-react';
import type { SprintStatus } from '@/lib/types';
import { updateSprintStatus } from './actions';

type StatusTone = 'ghost' | 'mint' | 'amber';

const statusConfig: Record<SprintStatus, { tone: StatusTone; dotClass: string }> = {
  planned:   { tone: 'ghost', dotClass: 'dot' },
  active:    { tone: 'mint',  dotClass: 'dot dot--mint' },
  completed: { tone: 'mint',  dotClass: 'dot dot--mint' },
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
    <div className="relative" ref={ref} style={{ display: 'inline-flex' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        disabled={isPending}
        className="btn btn--ghost btn--icon"
        title="Change sprint status"
        style={{ opacity: isPending ? 0.5 : undefined }}
      >
        <Settings
          size={12}
          style={{
            color: 'var(--fg-3)',
            animation: isPending ? 'spin 1s linear infinite' : undefined,
          }}
        />
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 50,
            minWidth: 150,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '6px 12px',
              borderBottom: '1px solid var(--line-1)',
            }}
          >
            <span className="upper" style={{ fontSize: 9 }}>Sprint Status</span>
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
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 11,
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
                <span className={sOpt.dotClass} />
                <span className="upper" style={{ fontSize: 10 }}>{status}</span>
                {isSelected && <Check size={12} style={{ marginLeft: 'auto' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

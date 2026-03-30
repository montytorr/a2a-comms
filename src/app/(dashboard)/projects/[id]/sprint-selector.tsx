'use client';

import { useRouter } from 'next/navigation';
import type { SprintStatus } from '@/lib/types';

const sprintStatusConfig: Record<SprintStatus, { bg: string; text: string }> = {
  planned: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500' },
  active: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400' },
  completed: { bg: 'bg-emerald-500/[0.06]', text: 'text-emerald-400' },
};

interface SprintSelectorProps {
  sprints: Array<{
    id: string;
    title: string;
    status: string;
    goal: string | null;
    start_date: string | null;
    end_date: string | null;
  }>;
  currentSprintId: string;
  projectId: string;
}

export default function SprintSelector({ sprints, currentSprintId, projectId }: SprintSelectorProps) {
  const router = useRouter();

  const tabs = [
    { id: 'all', label: 'All Tasks' },
    { id: 'backlog', label: 'Backlog' },
    ...sprints.map(s => ({ id: s.id, label: s.title, status: s.status })),
  ];

  const activeSprint = sprints.find(s => s.id === currentSprintId);

  return (
    <div className="mb-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
      <div className="flex gap-2 flex-wrap mb-3">
        {tabs.map((tab) => {
          const isActive = currentSprintId === tab.id;
          const sprintStatus = 'status' in tab ? tab.status : null;
          const sc = sprintStatus ? sprintStatusConfig[sprintStatus as SprintStatus] : null;

          return (
            <button
              key={tab.id}
              onClick={() => {
                const params = tab.id === 'all' ? '' : `?sprint=${tab.id}`;
                router.push(`/projects/${projectId}${params}`);
              }}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-wider uppercase transition-all duration-300 border flex items-center gap-1.5 ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                  : 'text-gray-600 border-white/[0.04] hover:text-gray-400 hover:border-white/[0.08] hover:bg-white/[0.02]'
              }`}
            >
              {sc && (
                <span className={`w-1.5 h-1.5 rounded-full ${sprintStatus === 'active' ? 'bg-cyan-400' : sprintStatus === 'completed' ? 'bg-emerald-400' : 'bg-gray-500'}`} />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active sprint info */}
      {activeSprint && activeSprint.goal && (
        <div className="rounded-xl glass-card px-4 py-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">Sprint Goal</p>
              <p className="text-[12px] text-gray-400 leading-relaxed">{activeSprint.goal}</p>
            </div>
            {(activeSprint.start_date || activeSprint.end_date) && (
              <div className="text-right shrink-0">
                <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">Duration</p>
                <p className="text-[11px] text-gray-500 font-mono tabular-nums">
                  {activeSprint.start_date ? new Date(activeSprint.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  {' → '}
                  {activeSprint.end_date ? new Date(activeSprint.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

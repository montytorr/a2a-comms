'use client';

import Link from 'next/link';
import type { ProjectStatus } from '@/lib/types';

const statusConfig: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  planning: { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400' },
  active: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  completed: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  archived: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500' },
};

const avatarGradients = [
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600',
  'from-amber-500 to-yellow-600',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarGradients.length;
}

interface ProjectHeaderProps {
  project: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  };
  members: Array<{
    id: string;
    role: string;
    agent: { id: string; name: string; display_name: string } | null;
  }>;
}

export default function ProjectHeader({ project, members }: ProjectHeaderProps) {
  const sc = statusConfig[project.status as ProjectStatus] || statusConfig.planning;

  return (
    <div className="mb-8 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/projects" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">
          Projects
        </Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <span className="text-[11px] text-gray-400">{project.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-[28px] font-bold text-white tracking-tight">{project.title}</h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${sc.bg} ${sc.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="text-[13px] text-gray-500 leading-relaxed max-w-2xl whitespace-pre-wrap">
              {project.description}
            </p>
          )}
        </div>

        {/* Member Avatars */}
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => {
              const name = m.agent?.display_name || m.agent?.name || '?';
              const idx = getAvatarIndex(name);
              return (
                <div
                  key={m.id}
                  title={`${name} (${m.role})`}
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradients[idx]} flex items-center justify-center border-2 border-[#0a0a10] text-[10px] font-bold text-white`}
                >
                  {name[0]?.toUpperCase()}
                </div>
              );
            })}
            {members.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center border-2 border-[#0a0a10] text-[10px] font-bold text-gray-400">
                +{members.length - 5}
              </div>
            )}
          </div>
          <span className="text-[11px] text-gray-600 ml-3">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

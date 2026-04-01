'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import MarkdownPreview from '@/components/markdown-preview';
import ProjectStatusDropdown from './project-status-dropdown';
import { addProjectMember, removeProjectMember } from './actions';

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
  availableAgents?: Array<{ id: string; name: string; display_name: string }>;
  isOwner?: boolean;
}

export default function ProjectHeader({ project, members, availableAgents = [], isOwner = false }: ProjectHeaderProps) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false);
      }
    }
    if (showAddDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAddDropdown]);

  function handleAddMember(agentId: string) {
    startTransition(async () => {
      await addProjectMember(project.id, agentId);
      setShowAddDropdown(false);
    });
  }

  function handleRemoveMember(memberId: string) {
    if (!confirm('Remove this member from the project?')) return;
    startTransition(async () => {
      await removeProjectMember(project.id, memberId);
    });
  }

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
            <ProjectStatusDropdown projectId={project.id} currentStatus={project.status} />
          </div>
          {project.description && (
            <div className="max-w-2xl">
              <MarkdownPreview content={project.description} />
            </div>
          )}
        </div>

        {/* Member Avatars */}
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m) => {
              const name = m.agent?.display_name || m.agent?.name || '?';
              const idx = getAvatarIndex(name);
              return (
                <div key={m.id} className="relative group/member">
                  <div
                    title={`${name} (${m.role})`}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradients[idx]} flex items-center justify-center border-2 border-[#0a0a10] text-[10px] font-bold text-white`}
                  >
                    {name[0]?.toUpperCase()}
                  </div>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={isPending}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/member:opacity-100 transition-all text-[8px] leading-none"
                      title={`Remove ${name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {members.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center border-2 border-[#0a0a10] text-[10px] font-bold text-gray-400">
                +{members.length - 5}
              </div>
            )}
          </div>

          {/* Add Member Button */}
          {isOwner && (
            <div className="relative ml-2" ref={dropdownRef}>
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                disabled={isPending}
                className="w-8 h-8 rounded-full border border-dashed border-white/[0.1] hover:border-cyan-500/30 hover:bg-cyan-500/[0.05] flex items-center justify-center transition-all"
                title="Add member"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 hover:text-cyan-400">
                  <path d="M12 5v14m-7-7h14" />
                </svg>
              </button>

              {showAddDropdown && (
                <div className="absolute top-full right-0 mt-2 z-50 min-w-[200px] max-h-[240px] overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a0a14]/95 backdrop-blur-xl shadow-2xl animate-fade-in">
                  <div className="px-3 py-2 border-b border-white/[0.04]">
                    <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Add Member</span>
                  </div>
                  {availableAgents.length === 0 ? (
                    <div className="px-3 py-3 text-[11px] text-gray-600 italic">No agents available</div>
                  ) : (
                    availableAgents.map((agent) => {
                      const name = agent.display_name || agent.name;
                      const idx = getAvatarIndex(name);
                      return (
                        <button
                          key={agent.id}
                          onClick={() => handleAddMember(agent.id)}
                          disabled={isPending}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                        >
                          <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarGradients[idx]} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>
                            {name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-300 font-medium truncate">{name}</p>
                            <p className="text-[9px] text-gray-600 truncate">{agent.name}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          <span className="text-[11px] text-gray-600 ml-3">{members.length} member{members.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

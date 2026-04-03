'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import MarkdownPreview from '@/components/markdown-preview';
import ProjectStatusDropdown from './project-status-dropdown';
import { inviteProjectMember, removeProjectMember, respondToProjectInvitation, updateProject } from './actions';

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
  invitations?: Array<{
    id: string;
    status: string;
    role: string;
    agent_id: string;
    agent: { id: string; name: string; display_name: string } | null;
    invited_by: { id: string; name: string; display_name: string } | null;
    created_at: string;
  }>;
  myPendingInvitations?: Array<{
    id: string;
    status: string;
    agent_id: string;
    role: string;
    agent: { id: string; name: string; display_name: string } | null;
    invited_by: { id: string; name: string; display_name: string } | null;
  }>;
  availableAgents?: Array<{ id: string; name: string; display_name: string }>;
  isOwner?: boolean;
}

function EditableProjectTitle({
  value,
  projectId,
  isOwner,
}: {
  value: string;
  projectId: string;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [isSaving, startSaveTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function save() {
    const newVal = text.trim();
    if (!newVal || newVal === value) {
      setText(value);
      setEditing(false);
      return;
    }
    startSaveTransition(async () => {
      await updateProject(projectId, { title: newVal });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="group/title flex items-center gap-2">
        <h1 className="text-[28px] font-bold text-white tracking-tight">{value}</h1>
        {isOwner && (
          <button
            onClick={() => setEditing(true)}
            className="p-1 rounded-md text-gray-600 opacity-0 group-hover/title:opacity-100 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
            title="Edit title"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setText(value); setEditing(false); }
        }}
        onBlur={save}
        disabled={isSaving}
        className="text-[28px] font-bold text-white tracking-tight bg-transparent outline-none ring-1 ring-cyan-500/30 rounded-lg px-2 py-0.5 w-full max-w-lg"
      />
    </div>
  );
}

function EditableProjectDescription({
  value,
  projectId,
  isOwner,
}: {
  value: string | null;
  projectId: string;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || '');
  const [isSaving, startSaveTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  function save() {
    const newVal = text.trim() || null;
    if (newVal === (value || null)) {
      setEditing(false);
      return;
    }
    startSaveTransition(async () => {
      await updateProject(projectId, { description: newVal });
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div
        className={`${isOwner ? 'group/desc cursor-pointer hover:bg-white/[0.02]' : ''} rounded-lg p-2 -m-2 transition-colors min-h-[24px] relative`}
        onClick={isOwner ? () => setEditing(true) : undefined}
        title={isOwner ? 'Click to edit description' : undefined}
      >
        {value ? (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <MarkdownPreview content={value} />
            </div>
            {isOwner && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="shrink-0 mt-0.5 p-1 rounded-md text-gray-600 opacity-0 group-hover/desc:opacity-100 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                title="Edit description"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-gray-600 italic">
            {isOwner ? 'Click to add project description…' : 'No description'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setText(value || ''); setEditing(false); }
        }}
        disabled={isSaving}
        placeholder="Write description (markdown supported)…"
        className="w-full bg-white/[0.03] text-[13px] text-gray-300 leading-relaxed rounded-lg p-2 outline-none ring-1 ring-cyan-500/30 resize-none placeholder-gray-600 min-h-[80px]"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => { setText(value || ''); setEditing(false); }}
          className="px-2 py-1 rounded-md text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 disabled:opacity-30 transition-all"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function ProjectHeader({ project, members, invitations = [], myPendingInvitations = [], availableAgents = [], isOwner = false }: ProjectHeaderProps) {
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
      await inviteProjectMember(project.id, agentId);
      setShowAddDropdown(false);
    });
  }

  function handleInvitation(invitationId: string, action: 'accept' | 'decline' | 'cancel') {
    startTransition(async () => {
      await respondToProjectInvitation(project.id, invitationId, action);
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
            <EditableProjectTitle value={project.title} projectId={project.id} isOwner={isOwner} />
            <ProjectStatusDropdown projectId={project.id} currentStatus={project.status} />
          </div>
          <div className="max-w-2xl">
            <EditableProjectDescription value={project.description} projectId={project.id} isOwner={isOwner} />
          </div>
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

      {(myPendingInvitations.length > 0 || (isOwner && invitations.length > 0)) && (
        <div className="mt-5 space-y-3">
          {myPendingInvitations.map((invitation) => {
            const inviter = invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown';
            const agentName = invitation.agent?.display_name || invitation.agent?.name || 'Unknown';
            return (
              <div key={invitation.id} className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-cyan-300">Pending invitation for {agentName}</p>
                  <p className="text-[11px] text-gray-400 mt-1">Invited by {inviter}. Accept to join this project, or decline to stay out.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleInvitation(invitation.id, 'decline')}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-[11px] text-gray-300 hover:bg-white/[0.04] transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleInvitation(invitation.id, 'accept')}
                    disabled={isPending}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          })}

          {isOwner && invitations.filter((inv) => inv.status === 'pending').length > 0 && (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-3">Pending Invitations</p>
              <div className="space-y-2">
                {invitations.filter((inv) => inv.status === 'pending').map((invitation) => {
                  const agentName = invitation.agent?.display_name || invitation.agent?.name || 'Unknown';
                  const inviter = invitation.invited_by?.display_name || invitation.invited_by?.name || 'Unknown';
                  return (
                    <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.04] bg-[#0a0a14] px-3 py-2.5">
                      <div>
                        <p className="text-[12px] text-white font-medium">{agentName}</p>
                        <p className="text-[10px] text-gray-600">Invited by {inviter} · awaiting response</p>
                      </div>
                      <button
                        onClick={() => handleInvitation(invitation.id, 'cancel')}
                        disabled={isPending}
                        className="px-2.5 py-1 rounded-md text-[10px] text-red-300 border border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/[0.12] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

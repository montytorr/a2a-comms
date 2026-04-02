'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSuperAdmin, linkAgentToUser, unlinkAgent, createUser } from './actions';
import { formatDate } from '@/lib/format-date';

interface UserProfile {
  id: string;
  display_name: string;
  is_super_admin: boolean;
  created_at: string;
  email: string;
}

interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
  owner: string;
  owner_user_id: string | null;
  capabilities: string[];
}

interface UsersClientProps {
  profiles: UserProfile[];
  agentsByOwner: Record<string, AgentInfo[]>;
  unlinkedAgents: AgentInfo[];
  currentUserId: string;
}

export default function UsersClient({
  profiles,
  agentsByOwner,
  unlinkedAgents: initialUnlinked,
  currentUserId,
}: UsersClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState('');

  // Add User form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsSuperAdmin, setNewIsSuperAdmin] = useState(false);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);

  async function handleToggleAdmin(userId: string, currentValue: boolean) {
    setLoading(userId);
    setError(null);
    const result = await toggleSuperAdmin(userId, !currentValue);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(null);
  }

  async function handleUnlinkAgent(agentId: string) {
    setLoading(agentId);
    setError(null);
    const result = await unlinkAgent(agentId);
    if (result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(null);
  }

  async function handleLinkAgent(userId: string) {
    if (!selectedAgent) return;
    setLoading(`link-${userId}`);
    setError(null);
    const result = await linkAgentToUser(selectedAgent, userId);
    if (result.error) {
      setError(result.error);
    } else {
      setLinkingUser(null);
      setSelectedAgent('');
      router.refresh();
    }
    setLoading(null);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setAddUserLoading(true);
    setAddUserError(null);

    const result = await createUser(newEmail, newDisplayName, newPassword, newIsSuperAdmin);
    if (result.error) {
      setAddUserError(result.error);
    } else {
      setShowAddUser(false);
      setNewEmail('');
      setNewDisplayName('');
      setNewPassword('');
      setNewIsSuperAdmin(false);
      setAddUserError(null);
      router.refresh();
    }
    setAddUserLoading(false);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-[0.25em] mb-2">
              Administration
            </p>
            <h1 className="text-[32px] font-bold text-white tracking-tight">Users</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage user profiles and agent ownership
            </p>
          </div>
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/15 hover:bg-cyan-500/[0.15] hover:border-cyan-500/25 transition-all duration-200 flex items-center gap-2"
          >
            {showAddUser ? (
              <>
                <span className="text-[14px]">✕</span>
                Cancel
              </>
            ) : (
              <>
                <span className="text-[14px]">+</span>
                Add User
              </>
            )}
          </button>
        </div>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <div className="mb-6 rounded-2xl glass-card overflow-hidden animate-fade-in">
          <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
          <form onSubmit={handleCreateUser} className="p-6">
            <h3 className="text-[14px] font-bold text-white tracking-tight mb-4">Create New User</h3>

            {addUserError && (
              <div className="mb-4 rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
                {addUserError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-[#0a0a10] border border-white/[0.06] rounded-lg px-3 py-2.5 text-[12px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-1.5">
                  Display Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-[#0a0a10] border border-white/[0.06] rounded-lg px-3 py-2.5 text-[12px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-1.5">
                  Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-[#0a0a10] border border-white/[0.06] rounded-lg px-3 py-2.5 text-[12px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-cyan-500/30 transition-colors"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 cursor-pointer py-2.5">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={newIsSuperAdmin}
                      onChange={(e) => setNewIsSuperAdmin(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 rounded-full bg-white/[0.06] border border-white/[0.06] peer-checked:bg-amber-500/20 peer-checked:border-amber-500/30 transition-all" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-gray-600 peer-checked:bg-amber-400 peer-checked:translate-x-4 transition-all" />
                  </div>
                  <span className="text-[12px] font-medium text-gray-400">Super Admin</span>
                </label>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="submit"
                disabled={addUserLoading}
                className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-cyan-500/20 border border-cyan-500/25 hover:bg-cyan-500/30 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addUserLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 rounded-full border-gray-600 border-t-cyan-400 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create User'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddUser(false);
                  setAddUserError(null);
                }}
                className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3 text-[13px] text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* User Cards */}
      <div className="space-y-6">
        {profiles.map((profile, idx) => {
          const userAgents = agentsByOwner[profile.id] || [];
          const isSelf = profile.id === currentUserId;

          return (
            <div
              key={profile.id}
              className="rounded-2xl glass-card overflow-hidden animate-fade-in"
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              {/* Top accent */}
              <div
                className={`h-px bg-gradient-to-r from-transparent ${
                  profile.is_super_admin
                    ? 'via-amber-500/30'
                    : 'via-cyan-500/20'
                } to-transparent`}
              />

              <div className="p-6">
                {/* User header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                        profile.is_super_admin
                          ? 'from-amber-500 to-orange-600'
                          : 'from-gray-600 to-gray-700'
                      } flex items-center justify-center shadow-lg shrink-0`}
                    >
                      <span className="text-sm font-bold text-white">
                        {(profile.display_name || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[16px] font-bold text-white tracking-tight">
                          {profile.display_name}
                        </h2>
                        {profile.is_super_admin && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/[0.1] px-2 py-0.5 rounded-full border border-amber-500/15 uppercase tracking-wider">
                            Super Admin
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/[0.1] px-2 py-0.5 rounded-full border border-cyan-500/15 uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-500 font-mono mt-0.5">
                        {profile.email}
                      </p>
                      <p className="text-[10px] text-gray-700 font-mono mt-0.5">
                        ID: {profile.id.slice(0, 8)}…
                      </p>
                    </div>
                  </div>

                  {/* Toggle admin button */}
                  <button
                    onClick={() =>
                      handleToggleAdmin(profile.id, profile.is_super_admin)
                    }
                    disabled={
                      loading === profile.id || (isSelf && profile.is_super_admin)
                    }
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 border ${
                      profile.is_super_admin
                        ? 'text-gray-500 bg-white/[0.02] border-white/[0.04] hover:text-red-400 hover:bg-red-500/[0.04] hover:border-red-500/15'
                        : 'text-amber-500 bg-amber-500/[0.04] border-amber-500/15 hover:bg-amber-500/[0.1]'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title={
                      isSelf && profile.is_super_admin
                        ? 'Cannot remove your own admin'
                        : undefined
                    }
                  >
                    {loading === profile.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 rounded-full border-gray-600 border-t-gray-400 animate-spin" />
                      </span>
                    ) : profile.is_super_admin ? (
                      'Remove Admin'
                    ) : (
                      'Make Admin'
                    )}
                  </button>
                </div>

                {/* Linked Agents */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">
                      Linked Agents ({userAgents.length})
                    </p>
                    <button
                      onClick={() =>
                        setLinkingUser(
                          linkingUser === profile.id ? null : profile.id
                        )
                      }
                      className="text-[10px] font-semibold text-cyan-400/70 hover:text-cyan-400 transition-colors"
                    >
                      {linkingUser === profile.id ? 'Cancel' : '+ Link Agent'}
                    </button>
                  </div>

                  {/* Link agent form */}
                  {linkingUser === profile.id && (
                    <div className="mb-3 flex items-center gap-2 animate-fade-in">
                      <select
                        value={selectedAgent}
                        onChange={(e) => setSelectedAgent(e.target.value)}
                        className="flex-1 bg-[#0a0a10] border border-white/[0.06] rounded-lg px-3 py-2 text-[12px] text-gray-200 focus:outline-none focus:border-cyan-500/30"
                      >
                        <option value="">Select unlinked agent…</option>
                        {initialUnlinked.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.display_name} ({a.name})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleLinkAgent(profile.id)}
                        disabled={
                          !selectedAgent || loading === `link-${profile.id}`
                        }
                        className="px-3 py-2 rounded-lg text-[11px] font-semibold text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/15 hover:bg-cyan-500/[0.12] transition-all disabled:opacity-30"
                      >
                        Link
                      </button>
                    </div>
                  )}

                  {userAgents.length === 0 ? (
                    <p className="text-[11px] text-gray-700 italic">
                      No agents linked
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {userAgents.map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 hover:bg-white/[0.03] transition-all duration-200"
                        >
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md shrink-0">
                            <span className="text-[9px] font-bold text-white">
                              {(agent.display_name || agent.name)
                                .split(/[\s-_]+/)
                                .map((w: string) => w[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-gray-200">
                              {agent.display_name}
                            </span>
                            <span className="text-[10px] text-gray-600 font-mono ml-2">
                              {agent.name}
                            </span>
                          </div>
                          {/* Capabilities */}
                          {agent.capabilities && agent.capabilities.length > 0 && (
                            <div className="flex gap-1">
                              {agent.capabilities.slice(0, 3).map((cap: string) => (
                                <span
                                  key={cap}
                                  className="text-[9px] font-medium text-cyan-400 bg-cyan-500/[0.08] px-1.5 py-0.5 rounded-full"
                                >
                                  {cap}
                                </span>
                              ))}
                              {agent.capabilities.length > 3 && (
                                <span className="text-[9px] text-gray-600">
                                  +{agent.capabilities.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => handleUnlinkAgent(agent.id)}
                            disabled={loading === agent.id}
                            className="text-[10px] font-semibold text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30"
                            title="Unlink agent"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-center gap-4">
                  <span className="text-[10px] text-gray-700 font-mono tabular-nums">
                    Joined{' '}
                    {formatDate(profile.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

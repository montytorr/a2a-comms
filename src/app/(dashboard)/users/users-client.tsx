'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleSuperAdmin, linkAgentToUser, unlinkAgent, createUser } from './actions';
import { formatDate } from '@/lib/format-date';
import { Plus, X, Shield, User, Bot, Link2, Unlink } from 'lucide-react';
import { Avatar, pillClassForName } from '@/components/atoms';

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
  activeAgentId: string | null;
  fallbackMode: 'selected-agent' | 'least-privilege';
}

export default function UsersClient({
  profiles,
  agentsByOwner,
  unlinkedAgents: initialUnlinked,
  currentUserId,
  activeAgentId,
  fallbackMode,
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
    <div style={{ padding: '28px 32px 60px' }}>
      {/* Header */}
      <div className="animate-fade-in" style={{ marginBottom: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="upper" style={{ color: 'var(--amber)', marginBottom: 6 }}>Administration</p>
            <h1 className="h1" style={{ marginBottom: 4 }}>Users</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 4 }}>
              Manage user profiles and agent ownership
            </p>
            <p className="mono dim" style={{ fontSize: 11 }}>
              Acting agent scope: {activeAgentId ? 'selected agent' : fallbackMode === 'least-privilege' ? 'least-privilege aggregate' : 'selected agent'}.
              Admin controls remain global.
            </p>
          </div>
          <button
            className="btn btn--sm"
            onClick={() => setShowAddUser(!showAddUser)}
            style={{ gap: 6 }}
          >
            {showAddUser ? (
              <><X size={13} /> Cancel</>
            ) : (
              <><Plus size={13} /> Add User</>
            )}
          </button>
        </div>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <div className="card animate-fade-in" style={{ marginBottom: 20, padding: 24 }}>
          <h3 className="h3" style={{ marginBottom: 16 }}>Create New User</h3>

          {addUserError && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--rose-bg)',
              border: '1px solid oklch(0.50 0.10 25 / 0.4)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--rose)',
            }}>
              {addUserError}
            </div>
          )}

          <form onSubmit={handleCreateUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="upper" style={{ display: 'block', marginBottom: 6 }}>
                  Email <span style={{ color: 'var(--rose)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="cp-input"
                />
              </div>
              <div>
                <label className="upper" style={{ display: 'block', marginBottom: 6 }}>
                  Display Name <span style={{ color: 'var(--rose)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className="cp-input"
                />
              </div>
              <div>
                <label className="upper" style={{ display: 'block', marginBottom: 6 }}>
                  Password <span style={{ color: 'var(--rose)' }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="cp-input"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingBottom: 4 }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="checkbox"
                      checked={newIsSuperAdmin}
                      onChange={(e) => setNewIsSuperAdmin(e.target.checked)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: newIsSuperAdmin ? 'var(--amber-bg)' : 'var(--bg-2)',
                      border: `1px solid ${newIsSuperAdmin ? 'oklch(0.55 0.12 60 / 0.55)' : 'var(--line-1)'}`,
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute',
                        top: 2,
                        left: newIsSuperAdmin ? 18 : 2,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: newIsSuperAdmin ? 'var(--amber)' : 'var(--fg-4)',
                        transition: 'all 0.15s',
                      }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>Super Admin</span>
                </label>
              </div>
            </div>

            <div className="row gap-3" style={{ marginTop: 20 }}>
              <button
                type="submit"
                disabled={addUserLoading}
                className="btn btn--primary btn--sm"
                style={{ opacity: addUserLoading ? 0.5 : 1 }}
              >
                {addUserLoading ? 'Creating…' : 'Create User'}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setShowAddUser(false);
                  setAddUserError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="animate-fade-in" style={{
          marginBottom: 20,
          padding: '10px 14px',
          background: 'var(--rose-bg)',
          border: '1px solid oklch(0.50 0.10 25 / 0.4)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--rose)',
        }}>
          {error}
        </div>
      )}

      {/* User Cards */}
      <div className="col gap-3">
        {profiles.map((profile, idx) => {
          const userAgents = agentsByOwner[profile.id] || [];
          const isSelf = profile.id === currentUserId;

          return (
            <div
              key={profile.id}
              className="card animate-fade-in"
              style={{ animationDelay: `${idx * 0.08}s` }}
            >
              <div style={{ padding: 24 }}>
                {/* User header */}
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div className="row gap-3">
                    <Avatar name={profile.display_name || profile.email || '?'} size={44} />
                    <div>
                      <div className="row gap-2" style={{ marginBottom: 3 }}>
                        <h2 className="h3">{profile.display_name}</h2>
                        {profile.is_super_admin && (
                          <span className="pill pill--amber">
                            <Shield size={9} />
                            Super Admin
                          </span>
                        )}
                        {isSelf && (
                          <span className={pillClassForName(profile.display_name || profile.email || 'You')}>
                            <User size={9} />
                            You
                          </span>
                        )}
                      </div>
                      <p className="mono" style={{ fontSize: 12, color: 'var(--fg-3)' }}>{profile.email}</p>
                      <p className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>
                        ID: {profile.id.slice(0, 8)}…
                      </p>
                    </div>
                  </div>

                  {/* Toggle admin button */}
                  <button
                    onClick={() => handleToggleAdmin(profile.id, profile.is_super_admin)}
                    disabled={loading === profile.id || (isSelf && profile.is_super_admin)}
                    className={profile.is_super_admin ? 'btn btn--sm btn--danger' : 'btn btn--sm'}
                    style={{
                      opacity: (loading === profile.id || (isSelf && profile.is_super_admin)) ? 0.35 : 1,
                      ...(profile.is_super_admin ? {} : { color: 'var(--amber)', borderColor: 'oklch(0.55 0.12 60 / 0.4)' }),
                    }}
                    title={isSelf && profile.is_super_admin ? 'Cannot remove your own admin' : undefined}
                  >
                    {loading === profile.id ? (
                      <span style={{ fontSize: 11 }}>…</span>
                    ) : profile.is_super_admin ? (
                      'Remove Admin'
                    ) : (
                      'Make Admin'
                    )}
                  </button>
                </div>

                {/* Linked Agents */}
                <div>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                    <p className="upper dim">Linked Agents ({userAgents.length})</p>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setLinkingUser(linkingUser === profile.id ? null : profile.id)}
                      style={{ height: 'auto', padding: '2px 8px', fontSize: 11 }}
                    >
                      {linkingUser === profile.id ? 'Cancel' : '+ Link Agent'}
                    </button>
                  </div>

                  {/* Link agent form */}
                  {linkingUser === profile.id && (
                    <div className="row gap-2 animate-fade-in" style={{ marginBottom: 10 }}>
                      <select
                        value={selectedAgent}
                        onChange={(e) => setSelectedAgent(e.target.value)}
                        className="cp-select"
                        style={{ flex: 1 }}
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
                        disabled={!selectedAgent || loading === `link-${profile.id}`}
                        className="btn btn--sm"
                        style={{
                          opacity: (!selectedAgent || loading === `link-${profile.id}`) ? 0.35 : 1,
                          gap: 5,
                          color: 'var(--peri)',
                          borderColor: 'oklch(0.50 0.08 265 / 0.4)',
                        }}
                      >
                        <Link2 size={12} />
                        Link
                      </button>
                    </div>
                  )}

                  {userAgents.length === 0 ? (
                    <p className="dim" style={{ fontSize: 12, fontStyle: 'italic' }}>
                      No agents linked
                    </p>
                  ) : (
                    <div className="col gap-2">
                      {userAgents.map((agent) => (
                        <div
                          key={agent.id}
                          className="row gap-3"
                          style={{
                            background: 'var(--bg-2)',
                            border: '1px solid var(--line-1)',
                            borderRadius: 6,
                            padding: '8px 12px',
                          }}
                        >
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: 'var(--peri-bg)',
                            border: '1px solid oklch(0.50 0.08 265 / 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Bot size={12} style={{ color: 'var(--peri)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, color: 'var(--fg-1)' }}>
                              {agent.display_name}
                            </span>
                            <span className="mono dim" style={{ fontSize: 10, marginLeft: 8 }}>
                              {agent.name}
                            </span>
                          </div>
                          {/* Capabilities */}
                          {agent.capabilities && agent.capabilities.length > 0 && (
                            <div className="row gap-1">
                              {agent.capabilities.slice(0, 3).map((cap: string) => (
                                <span key={cap} className="pill pill--peri" style={{ fontSize: 9 }}>
                                  {cap}
                                </span>
                              ))}
                              {agent.capabilities.length > 3 && (
                                <span className="dim" style={{ fontSize: 10 }}>
                                  +{agent.capabilities.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => handleUnlinkAgent(agent.id)}
                            disabled={loading === agent.id}
                            className="btn btn--ghost btn--icon btn--sm"
                            style={{
                              opacity: loading === agent.id ? 0.3 : 1,
                              width: 26,
                              height: 26,
                            }}
                            title="Unlink agent"
                          >
                            <Unlink size={11} style={{ color: 'var(--fg-3)' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Meta */}
                <div style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--line-1)',
                }}>
                  <span className="mono dim num" style={{ fontSize: 11 }}>
                    Joined {formatDate(profile.created_at)}
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

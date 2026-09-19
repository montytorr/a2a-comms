'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MarkdownPreview from '@/components/markdown-preview';
import { Avatar, PageFrame, EmptyState } from '@/components/atoms';
import { Bot } from 'lucide-react';

interface AgentRow {
  id: string;
  name: string;
  display_name: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      const response = await fetch('/api/internal/projects');
      const payload = await response.json().catch(() => ({}));
      if (response.ok) setAgents(payload.agents || []);
    };
    fetchAgents();
  }, []);

  const toggleAgent = (id: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/internal/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          member_agent_ids: Array.from(selectedAgents),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame width="narrow">
      {/* Breadcrumb */}
      <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Link href="/projects" className="text-2xs" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>Projects</Link>
        <span className="text-2xs" style={{ color: 'var(--fg-3)' }}>›</span>
        <span className="text-2xs" style={{ color: 'var(--fg-2)' }}>New Project</span>
      </div>

      <div className="animate-fade-in" style={{ marginBottom: '2rem' }}>
        <p className="upper text-2xs" style={{ fontWeight: 600, color: 'var(--peri)', marginBottom: '0.5rem' }}>Create</p>
        <h1 className="text-2xl" style={{ fontWeight: 700, color: 'var(--fg-0)', letterSpacing: '-0.02em' }}>New Project</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Title */}
        <div className="card animate-fade-in" style={{ padding: 'var(--space-5)', animationDelay: '0.05s' }}>
          <label className="text-2xs" style={{ display: 'block', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
            Title <span style={{ color: 'var(--rose)' }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project title..."
            className="cp-input text-sm"
            style={{ width: '100%' }}
          />
        </div>

        {/* Description */}
        <div className="card animate-fade-in" style={{ padding: 'var(--space-5)', animationDelay: '0.1s' }}>
          <label className="text-2xs" style={{ display: 'block', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project (markdown supported)..."
            rows={5}
            className="cp-textarea text-sm"
            style={{ width: '100%', resize: 'vertical', minHeight: '100px' }}
          />
          {description.trim() && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--line-1)' }}>
              <p className="text-2xs" style={{ fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>Preview</p>
              <MarkdownPreview content={description} className="muted" />
            </div>
          )}
        </div>

        {/* Members */}
        <div className="card animate-fade-in" style={{ padding: 'var(--space-5)', animationDelay: '0.15s' }}>
          <label className="text-2xs" style={{ display: 'block', fontWeight: 600, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>
            Initial Members
          </label>
          <p className="text-2xs" style={{ color: 'var(--fg-3)', marginBottom: '1rem' }}>Select agents to invite to this project. You will be added as owner automatically; others join after accepting.</p>

          {agents.length === 0 ? (
            <EmptyState
              icon={<Bot size={20} />}
              title="No agents registered yet"
              hint="Register an agent first and it becomes available to invite here."
              action={<Link className="btn btn--sm" href="/agents/register">Register Agent</Link>}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
              {agents.map((agent) => {
                const isSelected = selectedAgents.has(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-4)',
                      border: `1px solid ${isSelected ? 'var(--peri)' : 'var(--line-1)'}`,
                      background: isSelected ? 'var(--peri-bg)' : 'var(--bg-1)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <Avatar name={agent.display_name || agent.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        className="text-xs" style={{
                          
                          fontWeight: 500,
                          color: isSelected ? 'var(--peri)' : 'var(--fg-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {agent.display_name}
                      </p>
                      <p className="mono text-2xs" style={{ color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</p>
                    </div>
                    {isSelected && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--peri)', flexShrink: 0 }}>
                        <path d="M9 11l3 3L22 4" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              borderRadius: 'var(--radius-4)',
              background: 'var(--rose-bg)',
              border: '1px solid var(--rose)',
              padding: '0.75rem 1rem',
            }}
          >
            <p className="text-xs" style={{ color: 'var(--rose)' }}>{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', animationDelay: '0.2s' }}>
          <button
            type="submit"
            disabled={loading}
            className="btn btn--peri text-xs"
            style={{ padding: '0.75rem 1.5rem', fontWeight: 600, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
          <Link
            href="/projects"
            className="text-xs" style={{
              padding: '0.75rem 1.5rem',
              
              fontWeight: 500,
              borderRadius: 'var(--radius-4)',
              border: '1px solid var(--line-1)',
              color: 'var(--fg-2)',
              textDecoration: 'none',
              transition: 'border-color 0.15s, color 0.15s',
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </PageFrame>
  );
}

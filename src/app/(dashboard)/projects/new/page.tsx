'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import MarkdownPreview from '@/components/markdown-preview';

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
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('agents')
        .select('id, name, display_name')
        .order('name', { ascending: true });
      setAgents(data || []);
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
      const supabase = createBrowserClient();

      // Create project via direct DB (dashboard uses anon key + RLS bypass via service role)
      // For dashboard, we create directly via Supabase since we have auth context
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Use service-role via API route or direct insert
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

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 animate-fade-in">
        <Link href="/projects" className="text-[11px] text-gray-600 hover:text-cyan-400 transition-colors">Projects</Link>
        <span className="text-gray-700 text-[10px]">›</span>
        <span className="text-[11px] text-gray-400">New Project</span>
      </div>

      <div className="animate-fade-in">
        <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em] mb-2">Create</p>
        <h1 className="text-[28px] font-bold text-white tracking-tight mb-8">New Project</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <label className="block text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Project title..."
            className="w-full bg-[#0a0a14] border border-white/[0.06] rounded-xl px-4 py-3 text-[14px] text-gray-200 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200"
          />
        </div>

        {/* Description */}
        <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <label className="block text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your project (markdown supported)..."
            rows={5}
            className="w-full bg-[#0a0a14] border border-white/[0.06] rounded-xl px-4 py-3 text-[13px] text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/10 transition-all duration-200 resize-y min-h-[100px]"
          />
          {description.trim() && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-2">Preview</p>
              <MarkdownPreview content={description} className="text-[13px] text-gray-400" />
            </div>
          )}
        </div>

        {/* Members */}
        <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <label className="block text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-3">
            Initial Members
          </label>
          <p className="text-[11px] text-gray-600 mb-4">Select agents to invite to this project. You will be added as owner automatically; others join after accepting.</p>

          {agents.length === 0 ? (
            <p className="text-[12px] text-gray-600 italic py-4">No agents registered yet</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agents.map((agent) => {
                const isSelected = selectedAgents.has(agent.id);
                const idx = getAvatarIndex(agent.display_name || agent.name);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 text-left ${
                      isSelected
                        ? 'border-cyan-500/30 bg-cyan-500/[0.06]'
                        : 'border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarGradients[idx]} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                      {(agent.display_name || agent.name)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-medium truncate ${isSelected ? 'text-cyan-400' : 'text-gray-300'}`}>
                        {agent.display_name}
                      </p>
                      <p className="text-[10px] text-gray-600 font-mono truncate">{agent.name}</p>
                    </div>
                    {isSelected && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400 shrink-0">
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
          <div className="rounded-xl bg-red-500/[0.08] border border-red-500/20 px-4 py-3">
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 text-[12px] font-semibold rounded-xl bg-gradient-to-r from-cyan-500/[0.15] to-blue-500/[0.15] border border-cyan-500/25 text-cyan-400 hover:from-cyan-500/[0.25] hover:to-blue-500/[0.25] hover:border-cyan-500/40 transition-all duration-300 hover:shadow-[0_0_25px_rgba(6,182,212,0.12)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Project'}
          </button>
          <Link
            href="/projects"
            className="px-6 py-3 text-[12px] font-medium rounded-xl border border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/[0.1] transition-all duration-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { AgentReputationDetail } from '@/lib/types';

interface OperatorFeedbackFormProps {
  agentId: string;
  reputation: AgentReputationDetail;
}

const LABELS = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'manual-review', label: 'Manual review' },
] as const;

export default function OperatorFeedbackForm({ agentId }: OperatorFeedbackFormProps) {
  const [score, setScore] = useState('0.5');
  const [label, setLabel] = useState<(typeof LABELS)[number]['value']>('positive');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [taskId, setTaskId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/v1/agents/${agentId}/reputation-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: Number(score),
          review_label: label,
          summary,
          notes: notes || null,
          related_task_id: taskId || null,
          related_project_id: projectId || null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save feedback');
      }
      setSummary('');
      setNotes('');
      setTaskId('');
      setProjectId('');
      setFeedback({ type: 'success', message: 'Operator feedback recorded.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save feedback' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl glass-card overflow-hidden animate-fade-in" style={{ animationDelay: '0.09s' }}>
      <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
      <div className="px-7 py-5 border-b border-white/[0.04]">
        <h2 className="text-[15px] font-bold text-white tracking-tight">Operator feedback</h2>
        <p className="text-[11px] text-gray-600 mt-0.5">Write auditable review input directly into the reputation ledger.</p>
      </div>
      <form onSubmit={handleSubmit} className="p-7 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Score (-1 to 1)</span>
            <input value={score} onChange={(e) => setScore(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none" />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Review label</span>
            <select value={label} onChange={(e) => setLabel(e.target.value as typeof label)} className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none">
              {LABELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Summary</span>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Short operator verdict" required />
        </label>

        <label className="block space-y-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[110px] w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none" placeholder="Why this score was chosen" />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Related project ID (optional)</span>
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none" />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Related task ID (optional)</span>
            <input value={taskId} onChange={(e) => setTaskId(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none" />
          </label>
        </div>

        {feedback && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${feedback.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300' : 'border-rose-500/20 bg-rose-500/[0.08] text-rose-300'}`}>
            {feedback.message}
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Recording…' : 'Record feedback'}
          </button>
        </div>
      </form>
    </section>
  );
}

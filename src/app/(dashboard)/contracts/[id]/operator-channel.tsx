'use client';

import { useState } from 'react';
import { MessageSquareWarning, StickyNote, Check, X, Pencil, Trash2 } from 'lucide-react';
import MarkdownPreview from '@/components/markdown-preview';
import { formatDateTime } from '@/lib/format-date';
import { CONTRACT_NOTE_BODY_MAX, describeQuestionKind } from '@/lib/contract-operator-channel';
import type { OperatorNoteSummary, OperatorQuestionSummary } from '@/lib/types';
import {
  addContractNote,
  answerQuestion,
  dismissQuestion,
  editContractNote,
  withdrawNote,
} from './operator-channel-actions';
import styles from './operator-channel.module.css';

interface Props {
  contractId: string;
  notes: OperatorNoteSummary[];
  questions: OperatorQuestionSummary[];
  /** Agents in this contract, so "2 of 3 have read this" can be stated. */
  agentCount: number;
  ackCounts: Record<string, number>;
  canWrite: boolean;
}

const KIND_TONE: Record<string, { line: string; bg: string; fg: string; label: string }> = {
  question: { line: 'var(--line-2)', bg: 'var(--bg-2)', fg: 'var(--fg-2)', label: 'question' },
  validation: { line: 'var(--peri-line)', bg: 'var(--peri-bg)', fg: 'var(--peri)', label: 'validation' },
  blocked: { line: 'var(--rose-line)', bg: 'var(--rose-bg)', fg: 'var(--rose)', label: 'blocked' },
};

/**
 * The one place a person and an agent can speak to each other about a contract.
 *
 * Both directions share a panel rather than sitting in two, because they are one
 * conversation: an agent asks, an operator answers and often leaves a note so
 * the next agent does not have to ask the same thing.
 */
export default function OperatorChannel({
  contractId, notes, questions, agentCount, ackCounts, canWrite,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  const open = questions.filter((q) => q.status === 'open');
  const resolved = questions.filter((q) => q.status !== 'open');

  return (
    <section className={`card ${styles.channel}`} aria-labelledby="operator-channel-heading">
      <div
        className={styles.header}
      >
        <div className={styles.heading}>
          <span className={styles.icon}><StickyNote size={16} /></span>
          <div>
            <div className={styles.kicker}>Human ↔ agent</div>
            <h2 id="operator-channel-heading" className={styles.title}>Operator channel</h2>
          </div>
        </div>
        <div className={styles.summary}>
          <span>{notes.length} standing note{notes.length === 1 ? '' : 's'}</span>
          <span>{open.length} open question{open.length === 1 ? '' : 's'}</span>
        </div>
        {canWrite && !drafting && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setDrafting(true)}>
            Leave a note
          </button>
        )}
      </div>

      <div className={styles.body}>
        {(notes.length > 0 || open.length > 0 || resolved.length > 0) && (
          <p className={styles.explainer}>Standing notes stay visible to agents on every read. Questions pause work until you answer or dismiss them.</p>
        )}
        {canWrite && drafting && (
          <form
            action={async (formData: FormData) => {
              await addContractNote(contractId, formData);
              setDrafting(false);
            }}
            className="col"
            style={{ gap: 8 }}
          >
            <textarea
              name="body"
              className="cp-textarea"
              rows={4}
              maxLength={CONTRACT_NOTE_BODY_MAX}
              autoFocus
              placeholder="Standing instruction for every agent on this contract. Markdown is rendered."
            />
            <div className="row gap-2">
              <button type="submit" className="btn btn--primary btn--sm">Leave note</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDrafting(false)}>Cancel</button>
              <span className="dim text-2xs">Takes effect the next time an agent reads this contract. It does not wake anyone.</span>
            </div>
          </form>
        )}

        {open.length > 0 && (
          <div className="col" style={{ gap: 10 }}>
            {open.map((question) => {
              const tone = KIND_TONE[question.kind] ?? KIND_TONE.question!;
              return (
                <div
                  key={question.id}
                  className="col"
                  style={{ gap: 8, padding: 14, borderRadius: 10, border: `1px solid ${tone.line}`, background: tone.bg }}
                >
                  <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                    <MessageSquareWarning size={14} style={{ color: tone.fg, flexShrink: 0 }} />
                    <span className="text-sm" style={{ fontWeight: 600, color: 'var(--fg-0)' }}>
                      {question.asked_by_agent_name || 'An agent'} is asking you
                    </span>
                    <span className="pill" style={{ borderColor: tone.line, color: tone.fg }}>{tone.label}</span>
                    {question.blocking && (
                      <span className="pill pill--rose" title="The agent said it cannot proceed until this is answered.">
                        blocking
                      </span>
                    )}
                    <span className="dim text-2xs" style={{ marginLeft: 'auto' }}>{formatDateTime(question.created_at)}</span>
                  </div>
                  <span className="dim text-2xs">{describeQuestionKind(question.kind)}</span>
                  <MarkdownPreview content={question.body} className="" />

                  {canWrite && (answering === question.id ? (
                    <form
                      action={async (formData: FormData) => {
                        await answerQuestion(contractId, question.id, formData);
                        setAnswering(null);
                      }}
                      className="col"
                      style={{ gap: 8 }}
                    >
                      <textarea name="answer" className="cp-textarea" rows={3} autoFocus placeholder="Your answer. The agent is woken with it." />
                      <div className="row gap-2">
                        <button type="submit" className="btn btn--primary btn--sm">Answer</button>
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAnswering(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="row gap-2">
                      <button type="button" className="btn btn--sm" onClick={() => setAnswering(question.id)}>Answer</button>
                      <form action={dismissQuestion.bind(null, contractId, question.id)}>
                        <button
                          type="submit"
                          className="btn btn--ghost btn--sm"
                          title="Say that no answer is needed. The agent is still told, because it stopped waiting for one."
                        >
                          Dismiss
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {notes.length === 0 && open.length === 0 && resolved.length === 0 && (
          <div className={styles.empty}>
            <StickyNote size={16} aria-hidden="true" />
            <span>No standing notes or open questions yet.</span>
          </div>
        )}

        {notes.map((note) => {
          const acked = ackCounts[note.id] ?? 0;
          return (
            <div key={note.id} className={styles.note}>
              <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                <span className="text-xs" style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{note.author_name}</span>
                <span className="dim text-2xs">{formatDateTime(note.created_at)}</span>
                {note.updated_at !== note.created_at && <span className="dim text-2xs">· edited</span>}
                <span
                  className="dim text-2xs"
                  title="Acknowledgement is advisory — an unacknowledged note is still in force."
                >
                  · read by {acked} of {agentCount}
                </span>
                {canWrite && editing !== note.id && (
                  <span className="row gap-1" style={{ marginLeft: 'auto' }}>
                    <button type="button" className="btn btn--ghost btn--sm btn--icon" style={{ width: 24, height: 24 }} onClick={() => setEditing(note.id)} aria-label="Edit note">
                      <Pencil size={12} />
                    </button>
                    <form action={withdrawNote.bind(null, contractId, note.id)}>
                      <button type="submit" className="btn btn--ghost btn--sm btn--icon" style={{ width: 24, height: 24 }} aria-label="Withdraw note" title="Withdraw. Agents stop seeing it; the record keeps it.">
                        <Trash2 size={12} />
                      </button>
                    </form>
                  </span>
                )}
              </div>
              {editing === note.id ? (
                <form
                  action={async (formData: FormData) => {
                    await editContractNote(contractId, note.id, formData);
                    setEditing(null);
                  }}
                  className="col"
                  style={{ gap: 8 }}
                >
                  <textarea name="body" className="cp-textarea" rows={4} defaultValue={note.body} maxLength={CONTRACT_NOTE_BODY_MAX} autoFocus />
                  <div className="row gap-2">
                    <button type="submit" className="btn btn--primary btn--sm">Save</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <MarkdownPreview content={note.body} className="" />
              )}
            </div>
          );
        })}

        {resolved.length > 0 && (
          <details>
            <summary className="dim text-2xs" style={{ cursor: 'pointer' }}>
              {resolved.length} answered or dismissed question{resolved.length === 1 ? '' : 's'}
            </summary>
            <div className="col" style={{ gap: 10, marginTop: 10 }}>
              {resolved.map((question) => (
                <div key={question.id} className="col" style={{ gap: 4, paddingLeft: 12, borderLeft: '2px solid var(--line-1)' }}>
                  <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                    {question.status === 'answered'
                      ? <Check size={12} style={{ color: 'var(--mint)' }} />
                      : <X size={12} style={{ color: 'var(--fg-3)' }} />}
                    <span className="text-xs" style={{ color: 'var(--fg-1)' }}>{question.asked_by_agent_name || 'An agent'} asked</span>
                    <span className="dim text-2xs">{formatDateTime(question.created_at)}</span>
                  </div>
                  <span className="dim text-xs">{question.body}</span>
                  <span className="text-xs" style={{ color: 'var(--fg-1)' }}>
                    {question.status === 'answered'
                      ? `${question.answered_by_name || 'An operator'}: ${question.answer}`
                      : `Dismissed by ${question.answered_by_name || 'an operator'} — no answer needed.`}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

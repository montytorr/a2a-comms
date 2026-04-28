'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/components/markdown-renderers';

// ── Types ──

type ContentObj = Record<string, unknown>;

// ── Syntax-highlighted JSON ──

function SyntaxJson({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  const parts = json.split(/("(?:[^"\\]|\\.)*")/g);

  return (
    <pre
      className="mono"
      style={{
        fontSize: '12px',
        background: 'var(--bg-0)',
        border: '1px solid var(--line-1)',
        borderRadius: '0.75rem',
        padding: '1rem',
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.6,
      }}
    >
      {parts.map((part, i) => {
        if (part.startsWith('"') && part.endsWith('"')) {
          const next = parts[i + 1];
          if (next && next.trimStart().startsWith(':')) {
            return <span key={i} style={{ color: 'var(--peri)' }}>{part}</span>;
          }
          return <span key={i} style={{ color: 'var(--mint)' }}>{part}</span>;
        }
        return (
          <span key={i}>
            {part.split(/(\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g).map((sub, j) => {
              if (/^(true|false)$/.test(sub)) return <span key={j} style={{ color: 'var(--amber)' }}>{sub}</span>;
              if (sub === 'null') return <span key={j} style={{ color: 'var(--fg-3)' }}>{sub}</span>;
              if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(sub)) return <span key={j} style={{ color: 'var(--rose)' }}>{sub}</span>;
              return <span key={j} style={{ color: 'var(--fg-2)' }}>{sub}</span>;
            })}
          </span>
        );
      })}
    </pre>
  );
}

// ── Helper: render a string value as rich text ──

function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`markdown-preview ${className || ''}`}
      style={{ fontSize: '13px', color: 'var(--fg-1)', lineHeight: 1.6 }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
    </div>
  );
}

// ── Helper: labeled field ──

function Field({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.25rem' }}>{label}</p>
      <div style={{ fontSize: '13px', color: accent ? 'var(--peri)' : 'var(--fg-1)' }}>
        {children}
      </div>
    </div>
  );
}

// ── Helper: status pill ──

function StatusPill({ status }: { status: string }) {
  const toneMap: Record<string, string> = {
    accepted: 'mint',
    confirmed: 'mint',
    done: 'mint',
    completed: 'mint',
    both_tasks_done: 'mint',
    rejected: 'rose',
    failed: 'rose',
    pending: 'amber',
    in_progress: 'peri',
  };
  const tone = toneMap[status.toLowerCase()] || 'fg';
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '0.125rem 0.5rem',
        borderRadius: '0.375rem',
        border: `1px solid var(--${tone})`,
        background: `var(--${tone}-bg, var(--bg-2))`,
        color: `var(--${tone})`,
        display: 'inline-block',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Helper: render array of tasks/items ──

/** Known task-like keys get special header treatment; everything else falls through to ObjectFields */
const TASK_HEADER_KEYS = new Set(['id', 'title', 'status', 'priority', 'solution', 'description']);

function TaskList({ tasks }: { tasks: Array<Record<string, unknown>> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {tasks.map((task, i) => {
        const id = typeof task.id === 'string' ? task.id : null;
        const title = typeof task.title === 'string' ? task.title : null;
        const taskStatus = typeof task.status === 'string' ? task.status : null;
        const priority = typeof task.priority === 'string' ? task.priority : null;
        const solution = typeof task.solution === 'string' ? task.solution : null;
        const description = typeof task.description === 'string' ? task.description : null;

        const hasHeader = id || title || taskStatus || priority;

        return (
          <div key={i} style={{ borderRadius: '0.5rem', background: 'var(--bg-2)', border: '1px solid var(--line-1)', padding: '0.75rem' }}>
            {hasHeader && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                {id && <span className="mono" style={{ fontSize: '10px', color: 'var(--fg-3)' }}>{id.slice(0, 8)}</span>}
                {title && <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-0)' }}>{title}</span>}
                {taskStatus && <StatusPill status={taskStatus} />}
                {priority && <span className="mono" style={{ fontSize: '10px', color: 'var(--fg-2)' }}>{priority}</span>}
              </div>
            )}
            {solution && <RichText text={solution} />}
            {description && <RichText text={description} />}
            {/* Render all remaining keys not handled above */}
            <ObjectFields obj={task} exclude={TASK_HEADER_KEYS} />
          </div>
        );
      })}
    </div>
  );
}

// ── Helper: key-value list for objects ──

function ObjectFields({ obj, exclude }: { obj: ContentObj; exclude?: Set<string> }) {
  const skip = exclude || new Set();
  const entries = Object.entries(obj).filter(
    ([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {entries.map(([key, value]) => {
        // Nested object — render recursively or as structured
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.375rem' }}>{key.replace(/_/g, ' ')}</p>
              <div style={{ paddingLeft: '0.75rem', borderLeft: '2px solid var(--line-1)' }}>
                <ObjectFields obj={value as ContentObj} />
              </div>
            </div>
          );
        }
        // Array of objects (tasks, steps, etc.)
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          return (
            <div key={key}>
              <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.375rem' }}>{key.replace(/_/g, ' ')}</p>
              <TaskList tasks={value as Array<Record<string, unknown>>} />
            </div>
          );
        }
        // Array of strings
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '0.25rem' }}>{key.replace(/_/g, ' ')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {value.map((item, i) => (
                  <span key={i} style={{ fontSize: '11px', color: 'var(--fg-1)', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: '0.375rem', padding: '0.125rem 0.5rem' }}>
                    {String(item)}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        // Boolean
        if (typeof value === 'boolean') {
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="upper" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--fg-3)' }}>{key.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: value ? 'var(--mint)' : 'var(--rose)' }}>{value ? 'Yes' : 'No'}</span>
            </div>
          );
        }
        // String or number
        return (
          <Field key={key} label={key.replace(/_/g, ' ')}>
            <RichText text={String(value)} />
          </Field>
        );
      })}
    </div>
  );
}

// ── Main component ──

/** Keys handled separately in the layout, not in ObjectFields */
const HANDLED_KEYS = new Set(['from', 'type', 'summary', 'text', 'message', 'payload', 'status', 'project_id']);

export default function MessageCard({ content }: { content: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  const obj = typeof content === 'object' && content !== null ? content as ContentObj : null;
  if (!obj) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ fontSize: '13px', color: 'var(--fg-2)' }}>{String(content)}</p>
      </div>
    );
  }

  const msgType = typeof obj.type === 'string' ? obj.type : null;
  const sender = typeof obj.from === 'string' ? obj.from : null;
  const status = typeof obj.status === 'string' ? obj.status : null;
  const summary = typeof obj.summary === 'string' && obj.summary.length > 0 ? obj.summary : null;
  const projectId = typeof obj.project_id === 'string' ? obj.project_id : null;

  // Main text: could be top-level `text`, `message`, or inside payload
  const text = typeof obj.text === 'string' ? obj.text : typeof obj.message === 'string' ? obj.message : null;

  // Payload object (Clawdius-style messages)
  const payload = typeof obj.payload === 'object' && obj.payload !== null ? obj.payload as ContentObj : null;
  const payloadMessage = payload && typeof payload.message === 'string' ? payload.message : null;
  const payloadStatus = payload && typeof payload.status === 'string' ? payload.status : null;

  // Remaining fields not handled above
  const handledPayloadKeys = new Set(['message', 'status']);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header: type badge + status + from */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {msgType && (
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--peri)',
              background: 'var(--peri-bg)',
              border: '1px solid var(--peri)',
              padding: '0.125rem 0.5rem',
              borderRadius: '0.375rem',
            }}
          >
            {msgType.replace(/_/g, ' ')}
          </span>
        )}
        {(status || payloadStatus) && <StatusPill status={(status || payloadStatus)!} />}
        {sender && (
          <span style={{ fontSize: '9px', color: 'var(--fg-3)' }}>
            from <span style={{ color: 'var(--fg-2)', fontWeight: 500 }}>{sender}</span>
          </span>
        )}
        {projectId && (
          <span className="mono" style={{ fontSize: '9px', color: 'var(--fg-3)' }}>
            project {projectId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Summary */}
      {summary && <RichText text={summary} />}

      {/* Main text body */}
      {text && <RichText text={text} />}

      {/* Payload message (if different from top-level text) */}
      {payloadMessage && !text && <RichText text={payloadMessage} />}

      {/* Payload structured fields */}
      {payload && (
        <div style={{ marginTop: '0.25rem' }}>
          <ObjectFields obj={payload} exclude={handledPayloadKeys} />
        </div>
      )}

      {/* Remaining top-level fields */}
      <ObjectFields obj={obj} exclude={HANDLED_KEYS} />

      {/* Raw JSON toggle */}
      <div style={{ paddingTop: '0.25rem' }}>
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="upper"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--fg-3)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.08em',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: showRaw ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showRaw ? 'Hide' : 'Show'} raw JSON
        </button>
        {showRaw && <div style={{ marginTop: '0.5rem' }}><SyntaxJson data={content} /></div>}
      </div>
    </div>
  );
}

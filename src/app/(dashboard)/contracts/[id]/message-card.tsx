'use client';

import { useState } from 'react';

// ── Types ──

type ContentObj = Record<string, unknown>;

// ── Syntax-highlighted JSON ──

function SyntaxJson({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  const parts = json.split(/("(?:[^"\\]|\\.)*")/g);

  return (
    <pre className="text-[12px] bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed selection:bg-cyan-500/20 animate-fade-in" style={{ animationDuration: '0.15s' }}>
      {parts.map((part, i) => {
        if (part.startsWith('"') && part.endsWith('"')) {
          const next = parts[i + 1];
          if (next && next.trimStart().startsWith(':')) {
            return <span key={i} className="text-cyan-400">{part}</span>;
          }
          return <span key={i} className="text-emerald-400">{part}</span>;
        }
        return (
          <span key={i}>
            {part.split(/(\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g).map((sub, j) => {
              if (/^(true|false)$/.test(sub)) return <span key={j} className="text-amber-400">{sub}</span>;
              if (sub === 'null') return <span key={j} className="text-gray-600">{sub}</span>;
              if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(sub)) return <span key={j} className="text-violet-400">{sub}</span>;
              return <span key={j} className="text-gray-500">{sub}</span>;
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
    <p className={`text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap ${className || ''}`}>
      {text}
    </p>
  );
}

// ── Helper: labeled field ──

function Field({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">{label}</p>
      <div className={accent ? 'text-[13px] text-cyan-400' : 'text-[13px] text-gray-300'}>
        {children}
      </div>
    </div>
  );
}

// ── Helper: status pill ──

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    accepted: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/[0.12]',
    confirmed: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/[0.12]',
    done: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/[0.12]',
    completed: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/[0.12]',
    both_tasks_done: 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/[0.12]',
    rejected: 'text-red-400 bg-red-500/[0.08] border-red-500/[0.12]',
    failed: 'text-red-400 bg-red-500/[0.08] border-red-500/[0.12]',
    pending: 'text-amber-400 bg-amber-500/[0.08] border-amber-500/[0.12]',
    in_progress: 'text-blue-400 bg-blue-500/[0.08] border-blue-500/[0.12]',
  };
  const style = colors[status.toLowerCase()] || 'text-gray-400 bg-white/[0.04] border-white/[0.06]';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Helper: render array of tasks/items ──

function TaskList({ tasks }: { tasks: Array<Record<string, unknown>> }) {
  return (
    <div className="space-y-2">
      {tasks.map((task, i) => {
        const id = typeof task.id === 'string' ? task.id : null;
        const title = typeof task.title === 'string' ? task.title : null;
        const taskStatus = typeof task.status === 'string' ? task.status : null;
        const priority = typeof task.priority === 'string' ? task.priority : null;
        const solution = typeof task.solution === 'string' ? task.solution : null;
        const description = typeof task.description === 'string' ? task.description : null;
        return (
          <div key={i} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
            <div className="flex items-center gap-2 mb-1">
              {id && <span className="text-[10px] font-mono text-gray-600">{id.slice(0, 8)}</span>}
              {title && <span className="text-[12px] font-semibold text-gray-200">{title}</span>}
              {taskStatus && <StatusPill status={taskStatus} />}
              {priority && <span className="text-[10px] text-gray-500 font-mono">{priority}</span>}
            </div>
            {solution && <RichText text={solution} className="text-[12px] text-gray-400 mt-1" />}
            {description && <RichText text={description} className="text-[12px] text-gray-400 mt-1" />}
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
    <div className="space-y-2.5">
      {entries.map(([key, value]) => {
        // Nested object — render recursively or as structured
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1.5">{key.replace(/_/g, ' ')}</p>
              <div className="pl-3 border-l-2 border-white/[0.04]">
                <ObjectFields obj={value as ContentObj} />
              </div>
            </div>
          );
        }
        // Array of objects (tasks, steps, etc.)
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          return (
            <div key={key}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1.5">{key.replace(/_/g, ' ')}</p>
              <TaskList tasks={value as Array<Record<string, unknown>>} />
            </div>
          );
        }
        // Array of strings
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em] mb-1">{key.replace(/_/g, ' ')}</p>
              <div className="flex flex-wrap gap-1.5">
                {value.map((item, i) => (
                  <span key={i} className="text-[11px] text-gray-300 bg-white/[0.03] border border-white/[0.05] rounded-md px-2 py-0.5">
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
            <div key={key} className="flex items-center gap-2">
              <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">{key.replace(/_/g, ' ')}</span>
              <span className={`text-[11px] font-semibold ${value ? 'text-emerald-400' : 'text-red-400'}`}>{value ? 'Yes' : 'No'}</span>
            </div>
          );
        }
        // String or number
        return (
          <Field key={key} label={key.replace(/_/g, ' ')}>
            <RichText text={String(value)} className="text-[12px]" />
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
      <div className="space-y-2">
        <p className="text-[13px] text-gray-400">{String(content)}</p>
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
    <div className="space-y-3">
      {/* Header: type badge + status + from */}
      <div className="flex items-center gap-2 flex-wrap">
        {msgType && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-cyan-500/80 bg-cyan-500/[0.06] border border-cyan-500/[0.1] px-2 py-0.5 rounded-md">
            {msgType.replace(/_/g, ' ')}
          </span>
        )}
        {(status || payloadStatus) && <StatusPill status={(status || payloadStatus)!} />}
        {sender && (
          <span className="text-[9px] text-gray-600">
            from <span className="text-gray-500 font-medium">{sender}</span>
          </span>
        )}
        {projectId && (
          <span className="text-[9px] text-gray-700 font-mono">
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
        <div className="mt-1">
          <ObjectFields obj={payload} exclude={handledPayloadKeys} />
        </div>
      )}

      {/* Remaining top-level fields */}
      <ObjectFields obj={obj} exclude={HANDLED_KEYS} />

      {/* Raw JSON toggle */}
      <div className="pt-1">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 hover:text-gray-400 transition-colors duration-200 uppercase tracking-wider"
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
            className={`transition-transform duration-200 ${showRaw ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showRaw ? 'Hide' : 'Show'} raw JSON
        </button>
        {showRaw && <div className="mt-2"><SyntaxJson data={content} /></div>}
      </div>
    </div>
  );
}

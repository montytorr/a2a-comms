'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { AuditLogEntry } from '@/lib/types';
import { formatRelative, formatDateTime } from '@/lib/format-date';
import { HashChip } from '@/components/atoms';

// ── helpers ──────────────────────────────────────────────────────────────────

type ActionTone = 'mint' | 'amber' | 'rose' | 'ghost';

const ACTION_TONE: Record<string, ActionTone> = {
  'contract.accept': 'mint',
  'auth.success': 'mint',
  'kill_switch.deactivate': 'mint',
  'killswitch.deactivate': 'mint',
  'webhook.delivery.success': 'mint',
  'policy.kill_switch.deactivated': 'mint',

  'auth.failure': 'amber',
  'authz.denied': 'amber',
  'webhook.delivery.failure': 'amber',
  'contract.propose': 'amber',

  'contract.reject': 'rose',
  'contract.close': 'rose',
  'kill_switch.activate': 'rose',
  'killswitch.activate': 'rose',
  'webhook.disabled': 'rose',
  'suspicious.replay_detected': 'rose',
  'suspicious.invalid_signature': 'rose',
  'policy.kill_switch.activated': 'rose',
};

const getActionTone = (action: string): ActionTone => ACTION_TONE[action] ?? 'ghost';

const isSuccessRow = (action: string) => {
  const tone = getActionTone(action);
  return tone === 'mint';
};

const isFailRow = (action: string) => {
  const tone = getActionTone(action);
  return tone === 'rose';
};

function ActionIcon({ action }: { action: string }) {
  if (isSuccessRow(action)) {
    return (
      <Check
        size={12}
        strokeWidth={2.5}
        style={{ color: 'var(--mint)', flexShrink: 0 }}
      />
    );
  }
  if (isFailRow(action)) {
    return (
      <X
        size={12}
        strokeWidth={2.5}
        style={{ color: 'var(--rose)', flexShrink: 0 }}
      />
    );
  }
  // neutral / amber
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--fg-4)',
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

function toId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDetails(entry: AuditLogEntry): Record<string, unknown> | null {
  if (!entry.details || typeof entry.details !== 'object' || Array.isArray(entry.details)) return null;
  return entry.details as Record<string, unknown>;
}

function getTargetId(entry: AuditLogEntry): string | null {
  const details = toDetails(entry);
  return (
    toId(entry.resource_id) ||
    (details ? toId(details.contract_id) ?? toId(details.task_id) ?? toId(details.webhook_id) ?? toId(details.project_id) : null)
  );
}

function buildTags(entry: AuditLogEntry): string[] {
  const tags: string[] = [];
  if (entry.resource_type) tags.push(entry.resource_type);
  const details = toDetails(entry);
  if (details?.env && typeof details.env === 'string') tags.push(details.env);
  if (details?.region && typeof details.region === 'string') tags.push(details.region);
  return tags.slice(0, 2);
}

const PILL_TONE: Record<string, string> = {
  contract: 'pill--peri',
  task: 'pill--mint',
  webhook: 'pill--amber',
  project: 'pill--peri',
  auth: 'pill--amber',
  security: 'pill--rose',
};

function tagPillClass(tag: string): string {
  const key = Object.keys(PILL_TONE).find((k) => tag.toLowerCase().includes(k));
  return key ? PILL_TONE[key] : 'pill--ghost';
}

// ── column layout ─────────────────────────────────────────────────────────────

const COL_STATUS = 16;   // icon
const COL_ACTOR  = 100;
const COL_EVENT  = 240;
const COL_TAGS   = 140;
const COL_WHEN   = 80;

// ── sub-components ────────────────────────────────────────────────────────────

function TableHeader() {
  return (
    <div
      className="row mono upper"
      style={{
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line-1)',
        padding: '0 16px',
        height: 32,
        fontSize: 10,
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ width: COL_STATUS, flexShrink: 0 }} />
      <div style={{ width: COL_ACTOR, flexShrink: 0 }}>Actor</div>
      <div style={{ width: COL_EVENT, flexShrink: 0 }}>Event</div>
      <div style={{ width: COL_TAGS, flexShrink: 0 }}>Tags</div>
      <div style={{ flex: 1, minWidth: 0 }}>Target</div>
      <div style={{ width: COL_WHEN, flexShrink: 0, textAlign: 'right' }}>When</div>
    </div>
  );
}

function TableRow({ entry, isAlt }: { entry: AuditLogEntry; isAlt: boolean }) {
  const [hovered, setHovered] = useState(false);
  const tags = buildTags(entry);
  const targetId = getTargetId(entry);
  const tone = getActionTone(entry.action);
  const pillClass = `pill pill--${tone}`;

  return (
    <div
      className="row"
      style={{
        padding: '0 16px',
        height: 38,
        gap: 12,
        background: hovered ? 'var(--bg-2)' : isAlt ? 'oklch(0.155 0.013 250 / 0.5)' : 'transparent',
        borderBottom: '1px solid var(--line-1)',
        cursor: 'default',
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* status icon */}
      <div
        style={{ width: COL_STATUS, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <ActionIcon action={entry.action} />
      </div>

      {/* actor */}
      <div
        className="mono truncate-text"
        style={{ width: COL_ACTOR, flexShrink: 0, fontSize: 12, color: 'var(--fg-1)' }}
        title={entry.actor}
      >
        {entry.actor}
      </div>

      {/* event type */}
      <div style={{ width: COL_EVENT, flexShrink: 0, overflow: 'hidden' }}>
        <span className={pillClass} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.action}
        </span>
      </div>

      {/* tags */}
      <div className="row gap-1" style={{ width: COL_TAGS, flexShrink: 0, overflow: 'hidden' }}>
        {tags.map((tag) => (
          <span key={tag} className={`pill ${tagPillClass(tag)}`} style={{ fontSize: 10 }}>
            {tag}
          </span>
        ))}
      </div>

      {/* target */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {targetId ? (
          <HashChip value={targetId} />
        ) : (
          <span className="dim" style={{ fontSize: 12 }}>—</span>
        )}
      </div>

      {/* when */}
      <div
        className="mono num"
        style={{ width: COL_WHEN, flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--fg-3)' }}
        title={formatDateTime(entry.created_at)}
      >
        {formatRelative(entry.created_at)}
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export default function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 24 }}>
        <TableHeader />
        <div
          className="col gap-2"
          style={{ alignItems: 'center', justifyContent: 'center', padding: '64px 24px', color: 'var(--fg-3)' }}
        >
          <span style={{ fontSize: 13 }}>No audit entries recorded</span>
          <span className="dim" style={{ fontSize: 12 }}>Events will be logged here as they occur</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 24, overflow: 'hidden' }}>
      <TableHeader />
      {entries.map((entry, idx) => (
        <TableRow key={entry.id} entry={entry} isAlt={idx % 2 === 1} />
      ))}
    </div>
  );
}

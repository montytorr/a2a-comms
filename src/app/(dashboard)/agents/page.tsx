'use client';

import { useState } from 'react';
import { Filter, Plus, MoreHorizontal } from 'lucide-react';
import { Avatar, KV, SectionHeader, PageFrame } from '@/components/atoms';

const AGENTS = [
  {
    id: 'clawdius',
    name: 'Clawdius',
    tone: 'amber' as const,
    role: 'OpenClaw operator',
    type: 'internal' as const,
    desc: 'Primary orchestration agent for contract lifecycle management. Handles inbound partner requests, routes approval workflows, and maintains audit trails across all active contracts.',
    capabilities: ['Messaging', 'Contracts', 'Webhooks', 'Approvals', 'Audit', 'Sub-agents', 'Policy gating'],
    protocols: ['contract.v1', 'message.v1', 'webhook.deliver.v1', 'approval.v1', 'audit.read.v1'],
    config: { inbound: 'partner→', outbound: 'partner→', extension: '30s', context: 'human' },
    metrics: { active: 1, max: 10, observed: '28 mar 2026' },
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    tone: 'mint' as const,
    role: 'Policy enforcer',
    type: 'internal' as const,
    desc: 'Stateless policy evaluation agent. Intercepts all outbound webhook deliveries and validates payloads against registered policy rules before forwarding.',
    capabilities: ['Policy gating', 'Audit', 'Webhooks', 'Rate limiting'],
    protocols: ['webhook.deliver.v1', 'policy.eval.v1', 'audit.write.v1'],
    config: { inbound: 'internal→', outbound: 'internal→', extension: '5s', context: 'system' },
    metrics: { active: 3, max: 50, observed: '27 mar 2026' },
  },
  {
    id: 'nexus',
    name: 'Nexus',
    tone: 'peri' as const,
    role: 'Integration bridge',
    type: 'partner' as const,
    desc: 'External partner integration agent. Bridges third-party systems to the A2A contract plane via standardised message envelopes and schema translation.',
    capabilities: ['Messaging', 'Contracts', 'Schema translation', 'Auth delegation'],
    protocols: ['contract.v1', 'message.v1', 'auth.delegate.v1'],
    config: { inbound: 'external→', outbound: 'external→', extension: '60s', context: 'partner' },
    metrics: { active: 0, max: 5, observed: '25 mar 2026' },
  },
  {
    id: 'archiver',
    name: 'Archiver',
    tone: 'rose' as const,
    role: 'Retention worker',
    type: 'internal' as const,
    desc: 'Background archival agent responsible for compressing, encrypting, and migrating completed contract payloads to cold storage on schedule.',
    capabilities: ['Audit', 'Storage', 'Encryption', 'Scheduling'],
    protocols: ['audit.read.v1', 'storage.write.v1', 'schedule.v1'],
    config: { inbound: 'internal→', outbound: 'internal→', extension: '120s', context: 'system' },
    metrics: { active: 0, max: 2, observed: '26 mar 2026' },
  },
];

type FilterTab = 'all' | 'internal' | 'partner';

export default function AgentsPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const filtered = AGENTS.filter((a) => activeTab === 'all' || a.type === activeTab);

  return (
    <PageFrame>
      <SectionHeader
        eyebrow="Registry"
        title="Agents"
        sub={`Registered agent identities · ${AGENTS.length} total`}
        right={
          <>
            <button className="btn btn--ghost btn--sm btn--icon">
              <Filter size={14} />
            </button>
            <button className="btn btn--primary btn--sm row gap-2">
              <Plus size={13} />
              Register Agent
            </button>
          </>
        }
      />

      <div className="seg" style={{ marginBottom: 20 }}>
        {(['all', 'internal', 'partner'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </PageFrame>
  );
}

interface AgentData {
  id: string;
  name: string;
  tone?: 'amber' | 'mint' | 'peri' | 'rose';
  role: string;
  type: 'internal' | 'partner';
  desc: string;
  capabilities: string[];
  protocols: string[];
  config: { inbound: string; outbound: string; extension: string; context: string };
  metrics: { active: number; max: number; observed: string };
}

function AgentCard({ agent }: { agent: AgentData }) {
  const typePillClass = agent.type === 'internal' ? 'pill pill--mint' : 'pill pill--peri';
  const dotClass = agent.metrics.active > 0 ? 'dot dot--mint pulse' : 'dot';

  return (
    <div className="card" style={{ padding: 22 }}>
      {/* Header */}
      <div className="row gap-2" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
        <Avatar name={agent.name} size={40} />
        <div className="col gap-1" style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2">
            <span className="h3 truncate-text">{agent.name}</span>
            <span className={typePillClass}>{agent.type}</span>
          </div>
          <span className="dim" style={{ fontSize: 12 }}>{agent.role}</span>
        </div>
        <button className="btn btn--ghost btn--icon btn--sm" style={{ flexShrink: 0 }}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Description */}
      <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
        {agent.desc}
      </p>

      {/* Capabilities */}
      <div className="col gap-1" style={{ marginBottom: 12 }}>
        <div className="upper">Capabilities</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
          {agent.capabilities.map((cap) => (
            <span key={cap} className="pill pill--ghost">{cap}</span>
          ))}
        </div>
      </div>

      {/* Protocols */}
      <div className="col gap-1" style={{ marginBottom: 14 }}>
        <div className="upper">Protocols</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
          {agent.protocols.map((proto) => (
            <span key={proto} className="pill pill--peri mono">{proto}</span>
          ))}
        </div>
      </div>

      {/* Config inset block */}
      <div className="card card--inset" style={{ padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
          <KV label="Webhook">
            <span className="mono">{agent.config.inbound}</span>
          </KV>
          <KV label="Observer">
            <span className="mono">{agent.config.outbound}</span>
          </KV>
          <KV label="Extension">
            <span className="mono">{agent.config.extension}</span>
          </KV>
          <KV label="Routing">
            <span className="mono">{agent.config.context}</span>
          </KV>
        </div>
      </div>

      {/* Footer */}
      <div className="row gap-4" style={{ borderTop: '1px solid var(--line-1)', paddingTop: 12 }}>
        <div className="col gap-1">
          <div className="upper">Active rate</div>
          <div className="row gap-2">
            <span className={dotClass} />
            <span className="num mono" style={{ fontSize: 13, color: 'var(--fg-1)' }}>
              {agent.metrics.active}
            </span>
          </div>
        </div>
        <div className="col gap-1">
          <div className="upper">Max active contracts</div>
          <span className="num mono" style={{ fontSize: 13, color: 'var(--fg-1)' }}>
            {agent.metrics.max}
          </span>
        </div>
        <div className="col gap-1">
          <div className="upper">Observed</div>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {agent.metrics.observed}
          </span>
        </div>
      </div>
    </div>
  );
}

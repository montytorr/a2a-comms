import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import type { Agent, AgentReputationDetail, ServiceKey } from '@/lib/types';
import AutoRefresh from '@/components/auto-refresh';
import MarkdownPreview from '@/components/markdown-preview';
import KeyActions from './key-actions';
import ReputationPanel from './reputation-panel';
import TrustControls from './trust-controls';
import TrustPolicyControls from './trust-policy-controls';
import PrivacyControls from './privacy-controls';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { normalizeAgentTrustTier, TRUST_TIER_DESCRIPTIONS, TRUST_TIER_LABELS, TRUST_TIER_STYLES } from '@/lib/trust-tiers';
import { normalizeAgentTrustPolicy } from '@/lib/agent-trust-policy';
import { normalizeAgentPrivacyMetadata } from '@/lib/privacy-policy';
import { getAgentReputationDetail } from '@/lib/reputation-ledger';

export const dynamic = 'force-dynamic';

const avatarColors = [
  'var(--peri)',
  'var(--mint)',
  'var(--amber)',
  'var(--rose)',
];

function getAvatarIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % avatarColors.length;
}

function getInitials(name: string): string {
  return name.split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type ServiceKeyRow = Pick<ServiceKey, 'id' | 'key_id' | 'is_active' | 'created_at' | 'rotated_at' | 'expires_at' | 'label'>;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createServerClient();
  noStore();

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single();

  if (agentError || !agent) {
    notFound();
  }

  // Non-admin users can only view their own agents
  if (!user.isSuperAdmin && (agent as Agent).owner_user_id !== user.id) {
    notFound();
  }

  const { data: keys } = await supabase
    .from('service_keys')
    .select('id, key_id, is_active, created_at, rotated_at, expires_at, label')
    .eq('agent_id', id)
    .order('created_at', { ascending: false });

  const reputation = await getAgentReputationDetail(id) as AgentReputationDetail;

  const serviceKeys = (keys || []) as ServiceKeyRow[];
  const agentData = agent as Agent;
  const name = agentData.display_name || agentData.name;
  const avatarIdx = getAvatarIndex(name);
  const avatarColor = avatarColors[avatarIdx];
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const trustTier = normalizeAgentTrustTier(agentData.trust_tier);
  const trustStyle = TRUST_TIER_STYLES[trustTier];
  const canEditTrust = user.isSuperAdmin || agentData.owner_user_id === user.id;
  const trustPolicy = normalizeAgentTrustPolicy(agentData.trust_policy);
  const privacyMetadata = normalizeAgentPrivacyMetadata(agentData.privacy_metadata);

  return (
    <AutoRefresh intervalMs={30000}>
    <div style={{ padding: '1.5rem' }}>
      {/* Back link */}
      <Link href="/agents" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '12px', color: 'var(--fg-3)', marginBottom: '1.5rem', textDecoration: 'none' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        Back to Agents
      </Link>

      {/* Agent Header Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              borderRadius: '0.75rem',
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--bg-0)' }}>{getInitials(name)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="h2" style={{ marginBottom: '0.25rem' }}>{agentData.display_name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <code className="mono" style={{ fontSize: '11px', color: 'var(--fg-3)', background: 'var(--bg-1)', padding: '0.125rem 0.5rem', borderRadius: '0.375rem', border: '1px solid var(--line-1)' }}>{agentData.name}</code>
                <span className="dim" style={{ fontSize: '12px' }}>{agentData.owner}</span>
                <span className={`pill pill--${trustTier === 'internal' ? 'mint' : trustTier === 'partner' ? 'peri' : 'ghost'}`}>
                  <span className={`dot dot--${trustTier === 'internal' ? 'mint' : trustTier === 'partner' ? 'peri' : 'ghost'}`} />
                  {TRUST_TIER_LABELS[trustTier]}
                </span>
              </div>
              {agentData.description && (
                <div style={{ marginTop: '0.75rem' }}>
                  <MarkdownPreview content={agentData.description} className="muted" />
                </div>
              )}
              <div className="card--inset" style={{ marginTop: '0.75rem', padding: '0.75rem 1rem' }}>
                <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Trust posture</p>
                <p style={{ fontSize: '12px', color: 'var(--fg-1)' }}>{TRUST_TIER_DESCRIPTIONS[trustTier]}</p>
                {agentData.trust_notes && <p className="dim" style={{ fontSize: '11px', marginTop: '0.5rem' }}>{agentData.trust_notes}</p>}
              </div>
            </div>
          </div>

          {/* Capabilities */}
          {agentData.capabilities && agentData.capabilities.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.5rem' }}>Capabilities</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {agentData.capabilities.map((cap) => (
                  <span key={cap} className="pill pill--peri">{cap}</span>
                ))}
              </div>
            </div>
          )}

          {/* Protocols */}
          {agentData.protocols && agentData.protocols.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.5rem' }}>Protocols</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {agentData.protocols.map((proto) => (
                  <span key={proto} className="pill pill--ghost mono">{proto}</span>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line-1)' }}>
            <div>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Active Keys</p>
              <span className="num" style={{ fontSize: '14px', color: 'var(--mint)' }}>
                {serviceKeys.filter((k) => k.is_active).length}
              </span>
            </div>
            <div>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Max Active Contracts</p>
              <span className="mono num" style={{ fontSize: '14px', color: 'var(--fg-2)' }}>
                {agentData.max_concurrent_contracts || '∞'}
              </span>
            </div>
            <div>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Registered</p>
              <span className="mono num" style={{ fontSize: '14px', color: 'var(--fg-2)' }}>
                {formatDate(agentData.created_at)}
              </span>
            </div>
            <div>
              <p className="upper dim" style={{ fontSize: '9px', marginBottom: '0.375rem' }}>Updated</p>
              <span className="mono num" style={{ fontSize: '14px', color: 'var(--fg-2)' }}>
                {formatDate(agentData.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem', display: 'grid', gap: '1.5rem' }}>
        <div className="card--inset" style={{ padding: '1.25rem', borderRadius: '1rem' }}>
          <p className="upper muted" style={{ fontSize: '10px' }}>How this page works</p>
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem', fontSize: '12px', color: 'var(--fg-2)' }}>
            <div>
              <p style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Trust tier is site-wide for this agent</p>
              <p style={{ marginTop: '0.25rem' }}>It sets the default collaboration posture for memberships, observers, handoffs, invitations, and similar platform decisions.</p>
            </div>
            <div>
              <p style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Trust policy narrows specific sensitive surfaces</p>
              <p style={{ marginTop: '0.25rem' }}>These controls can tighten observer reads, attachment downloads, webhook management, participant visibility, and pending invitation visibility. They do not elevate the agent above its base tier.</p>
            </div>
            <div>
              <p style={{ fontWeight: 500, color: 'var(--fg-0)' }}>Privacy defaults guide data handling</p>
              <p style={{ marginTop: '0.25rem' }}>These settings expose how this agent&apos;s data should be retained, redacted, exported, and reused. They inform operators and downstream automation, but most of them are not automatic purge jobs by themselves.</p>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.25rem', border: '1px solid var(--peri-bg)', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <p className="upper" style={{ fontSize: '10px', color: 'var(--peri)', fontWeight: 600 }}>Exposed privacy defaults</p>
              <h2 className="h3" style={{ marginTop: '0.25rem' }}>Current operator-facing privacy posture</h2>
              <p className="muted" style={{ fontSize: '11px', marginTop: '0.25rem', maxWidth: '48rem' }}>This summary makes the active privacy metadata visible before anyone edits it, so operators can quickly see handling, retention, reuse, and export expectations from the main agent detail flow.</p>
            </div>
            {!canEditTrust && <span className="pill pill--ghost">View only</span>}
          </div>
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {[
              { label: 'Handling', value: privacyMetadata.data_handling, desc: 'Default sensitivity posture for collaboration and downstream review.', tone: null },
              { label: 'Retention', value: `${privacyMetadata.retention_days} days`, desc: 'Policy target unless a janitor or export workflow explicitly enforces it.', tone: null },
              { label: 'Redaction', value: privacyMetadata.redaction_level, desc: 'How aggressively logs, exports, and summaries should mask detail.', tone: null },
              { label: 'Training reuse', value: privacyMetadata.allow_training ? 'Allowed' : 'Blocked', desc: "Whether this agent's work may feed model improvement pipelines by default.", tone: privacyMetadata.allow_training ? 'amber' : 'mint' },
              { label: 'Operator exports', value: privacyMetadata.allow_operator_exports ? 'Allowed' : 'Restricted', desc: 'Whether exports should be treated as permitted by default.', tone: privacyMetadata.allow_operator_exports ? 'mint' : 'rose' },
            ].map(({ label, value, desc, tone }) => (
              <div key={label} className="card--inset" style={{ padding: '0.875rem 1rem' }}>
                <p className="upper dim" style={{ fontSize: '10px' }}>{label}</p>
                <p style={{ marginTop: '0.5rem', fontSize: '14px', fontWeight: 600, color: tone ? `var(--${tone})` : 'var(--fg-0)', textTransform: 'capitalize' }}>{value}</p>
                <p className="dim" style={{ marginTop: '0.25rem', fontSize: '11px' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
        <ReputationPanel reputation={reputation} />
        <TrustControls
          agentId={agentData.id}
          initialTier={trustTier}
          initialNotes={agentData.trust_notes || null}
          canEdit={canEditTrust}
        />
        <TrustPolicyControls
          agentId={agentData.id}
          initialTier={trustTier}
          initialPolicy={trustPolicy}
          canEdit={canEditTrust}
        />
        <PrivacyControls
          agentId={agentData.id}
          initialPrivacy={privacyMetadata}
          canEdit={canEditTrust}
        />
      </div>

      {/* Service Keys Section */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 className="h3">Service Keys</h2>
            <p className="dim" style={{ fontSize: '11px', marginTop: '0.125rem' }}>{serviceKeys.length} key{serviceKeys.length !== 1 ? 's' : ''}</p>
          </div>
          <KeyActions agentId={agentData.id} />
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {serviceKeys.length === 0 ? (
            <div style={{ padding: '3rem 0', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '14px', fontWeight: 500 }}>No service keys</p>
              <p className="dim" style={{ fontSize: '11px', marginTop: '0.25rem' }}>Use &quot;Rotate Key&quot; to generate a new key</p>
            </div>
          ) : (
            serviceKeys.map((key) => {
              const isExpired = key.expires_at && new Date(key.expires_at) < now;
              const isExpiring = key.expires_at && !isExpired && new Date(key.expires_at) < twoHoursFromNow;

              return (
                <div
                  key={key.id}
                  style={{
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    border: '1px solid',
                    borderColor: !key.is_active || isExpired ? 'var(--line-1)' : isExpiring ? 'var(--amber-bg)' : 'var(--line-2)',
                    background: !key.is_active || isExpired ? 'var(--bg-1)' : isExpiring ? 'var(--amber-bg)' : 'var(--bg-1)',
                    opacity: !key.is_active || isExpired ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      className={`dot dot--${!key.is_active || isExpired ? 'ghost' : isExpiring ? 'amber' : 'mint'}`}
                    />
                    <code className="mono" style={{ fontSize: '13px', color: 'var(--fg-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.key_id}</code>
                    <span
                      className={`pill pill--${!key.is_active || isExpired ? 'ghost' : isExpiring ? 'amber' : 'mint'}`}
                    >
                      {isExpired ? 'Expired' : !key.is_active ? 'Inactive' : isExpiring ? 'Expiring' : 'Active'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.75rem', marginLeft: '1.25rem', flexWrap: 'wrap' }}>
                    {key.label && (
                      <span className="dim" style={{ fontSize: '10px' }}>{key.label}</span>
                    )}
                    <span className="mono dim" style={{ fontSize: '10px', marginLeft: 'auto' }}>
                      Created {formatDate(key.created_at)}
                    </span>
                    {key.rotated_at && (
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--amber)' }}>
                        Rotated {formatDate(key.rotated_at)}
                      </span>
                    )}
                    {key.expires_at && (
                      <span className="mono" style={{ fontSize: '10px', color: isExpired ? 'var(--fg-3)' : 'var(--amber)' }}>
                        {isExpired ? 'Expired' : 'Expires'} {formatDateTime(key.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </AutoRefresh>
  );
}

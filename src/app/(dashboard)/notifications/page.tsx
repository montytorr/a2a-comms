import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { Bell } from 'lucide-react';
import AutoRefresh from '@/components/auto-refresh';
import { getAuthActorContext } from '@/lib/auth-actor-context';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';
import { formatDate } from '@/lib/format-date';
import { PageFrame, EmptyState } from '@/components/atoms';
import { NotificationCountsSync } from './notification-counts-sync';

export const dynamic = 'force-dynamic';

const kindPillTone: Record<string, string> = {
  'contract-invitation': 'pill--mint',
  'task-assigned': 'pill--peri',
  'task-blocked': 'pill--rose',
  'task-blocked-stale': 'pill--rose',
  'task-blocked-follow-through': 'pill--amber',
  'project-invitation': 'pill--mint',
  'approval-request': 'pill--amber',
  'agent-question': 'pill--rose',
};

export default async function NotificationsPage() {
  // Same context and same function as /api/internal/notifications, which feeds
  // the navigation badge, so the two cannot disagree on scope.
  const auth = await getAuthActorContext();
  if (!auth?.user) redirect('/login');

  noStore();
  const { counts, items } = await getDashboardNotificationSummary(auth);

  return (
    <AutoRefresh intervalMs={10000} watch={['contracts', 'participants', 'tasks', 'projects', 'approvals']}>
      <NotificationCountsSync counts={counts} />
      <PageFrame width="prose">
        {/* Header */}
        <div style={{ marginBottom: '32px' }} className="animate-fade-in">
          <div className="row gap-3" style={{ marginBottom: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-3)',
                background: 'var(--mint-bg)',
                border: '1px solid var(--mint-line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bell size={16} style={{ color: 'var(--mint)' }} />
            </div>
            <div>
              <p className="upper" style={{ marginBottom: '2px' }}>Inbox</p>
              <h1 className="h1">Notifications</h1>
            </div>
          </div>
          <p className="muted text-sm" style={{ lineHeight: '1.6', marginTop: '8px' }}>
            Derived in-app attention queue for agents waiting on an answer from you, blocked work, contract invites, project invites, assigned work, and approval requests.
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '20px' }} className="animate-fade-in">
          <StatCard label="Total" value={counts.total} accentVar="--mint" />
          <StatCard label="Blockers" value={counts.blockers} accentVar="--rose" />
          <StatCard label="Contracts + projects" value={counts.contracts + counts.projects} accentVar="--peri" />
          <StatCard label="Approvals" value={counts.approvals} accentVar="--amber" />
          <StatCard label="Agents asking you" value={counts.questions} accentVar="--rose" />
        </div>

        {/* Items list */}
        <div className="card animate-fade-in">
          {/* List header */}
          <div
            className="row"
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--line-1)',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <h2 className="h3">Actionable items</h2>
              <p className="dim text-2xs" style={{ marginTop: '2px' }}>Auto-refreshing every 10 seconds.</p>
            </div>
            <span className="pill pill--mint">{items.length} visible</span>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<Bell size={20} />}
              title="Nothing needs attention"
              hint="A rare and suspiciously pleasant state of affairs."
            />
          ) : (
            <div>
              {items.map((item, idx) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="link-surface"
                  style={{
                    display: 'block',
                    padding: '14px 20px',
                    borderBottom: idx < items.length - 1 ? '1px solid var(--line-1)' : 'none',
                    textDecoration: 'none',
                  }}
                >
                  <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row gap-2" style={{ flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span className={`pill ${kindPillTone[item.kind] || 'pill--ghost'}`}>
                          {item.kind.replace(/-/g, ' ')}
                        </span>
                        {item.meta && <span className="dim text-2xs">{item.meta}</span>}
                      </div>
                      <p className="text-sm" style={{ fontWeight: 600, color: 'var(--fg-0)', margin: 0 }}>{item.title}</p>
                      <p className="muted text-sm" style={{ marginTop: '3px' }}>{item.body}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '16px' }}>
                      <p className="mono dim text-2xs">{formatDate(item.createdAt)}</p>
                      <p className="text-2xs" style={{ color: 'var(--mint)', marginTop: '4px' }}>Open →</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </PageFrame>
    </AutoRefresh>
  );
}

function StatCard({ label, value, accentVar }: { label: string; value: number; accentVar: string }) {
  return (
    <div
      className="card"
      style={{ padding: '16px 18px' }}
    >
      <p className="upper dim" style={{ marginBottom: '6px' }}>{label}</p>
      <p className="mono num text-2xl" style={{ fontWeight: 700, color: `var(${accentVar})` }}>{value}</p>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { Bell } from 'lucide-react';
import AutoRefresh from '@/components/auto-refresh';
import { getAuthUser } from '@/lib/auth-context';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';
import { formatDate } from '@/lib/format-date';

export const dynamic = 'force-dynamic';

const kindPillTone: Record<string, string> = {
  'contract-invitation': 'pill--mint',
  'task-assigned': 'pill--peri',
  'task-blocked': 'pill--rose',
  'task-blocked-stale': 'pill--rose',
  'task-blocked-follow-through': 'pill--amber',
  'project-invitation': 'pill--mint',
  'approval-request': 'pill--amber',
};

export default async function NotificationsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  noStore();
  const { counts, items } = await getDashboardNotificationSummary(user);

  return (
    <AutoRefresh intervalMs={10000}>
      <div style={{ padding: '28px 32px 60px', maxWidth: '900px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }} className="animate-fade-in">
          <div className="row gap-3" style={{ marginBottom: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'var(--mint-bg)',
                border: '1px solid oklch(0.50 0.10 165 / 0.3)',
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
          <p className="muted" style={{ fontSize: '13px', lineHeight: '1.6', marginTop: '8px' }}>
            Derived in-app attention queue for blocked work, contract invites, project invites, assigned work, and approval requests.
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }} className="animate-fade-in">
          <StatCard label="Total" value={counts.total} accentVar="--mint" />
          <StatCard label="Blockers" value={counts.blockers} accentVar="--rose" />
          <StatCard label="Contracts + projects" value={counts.contracts + counts.projects} accentVar="--peri" />
          <StatCard label="Approvals" value={counts.approvals} accentVar="--amber" />
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
              <p className="dim" style={{ fontSize: '11px', marginTop: '2px' }}>Auto-refreshing every 10 seconds.</p>
            </div>
            <span className="pill pill--mint">{items.length} visible</span>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  marginBottom: '14px',
                }}
              >
                <Bell size={18} style={{ color: 'var(--fg-4)' }} />
              </div>
              <p className="muted" style={{ fontSize: '13px', fontWeight: 500 }}>Nothing needs attention</p>
              <p className="dim" style={{ fontSize: '11px', marginTop: '4px' }}>A rare and suspiciously pleasant state of affairs.</p>
            </div>
          ) : (
            <div>
              {items.map((item, idx) => (
                <Link
                  key={item.id}
                  href={item.href}
                  style={{
                    display: 'block',
                    padding: '14px 20px',
                    borderBottom: idx < items.length - 1 ? '1px solid var(--line-1)' : 'none',
                    transition: 'background 0.12s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="row gap-2" style={{ flexWrap: 'wrap', marginBottom: '6px' }}>
                        <span className={`pill ${kindPillTone[item.kind] || 'pill--ghost'}`}>
                          {item.kind.replace(/-/g, ' ')}
                        </span>
                        {item.meta && <span className="dim" style={{ fontSize: '11px' }}>{item.meta}</span>}
                      </div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg-0)', margin: 0 }}>{item.title}</p>
                      <p className="muted" style={{ fontSize: '13px', marginTop: '3px' }}>{item.body}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '16px' }}>
                      <p className="mono dim" style={{ fontSize: '11px' }}>{formatDate(item.createdAt)}</p>
                      <p style={{ fontSize: '11px', color: 'var(--mint)', marginTop: '4px' }}>Open →</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
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
      <p className="mono num" style={{ fontSize: '28px', fontWeight: 700, color: `var(${accentVar})` }}>{value}</p>
    </div>
  );
}

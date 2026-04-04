import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import AutoRefresh from '@/components/auto-refresh';
import { getAuthUser } from '@/lib/auth-context';
import { getDashboardNotificationSummary } from '@/lib/dashboard-notifications';
import { formatDate } from '@/lib/format-date';

export const dynamic = 'force-dynamic';

const kindStyles = {
  'contract-invitation': 'text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/20',
  'task-assigned': 'text-violet-400 bg-violet-500/[0.08] border-violet-500/20',
  'task-blocked': 'text-rose-300 bg-rose-500/[0.08] border-rose-500/20',
  'task-blocked-stale': 'text-red-300 bg-red-500/[0.12] border-red-500/25',
  'task-blocked-follow-through': 'text-amber-300 bg-amber-500/[0.1] border-amber-500/20',
  'project-invitation': 'text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20',
  'approval-request': 'text-amber-400 bg-amber-500/[0.08] border-amber-500/20',
} as const;

export default async function NotificationsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  noStore();
  const { counts, items } = await getDashboardNotificationSummary(user);

  return (
    <AutoRefresh intervalMs={10000}>
      <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-600/15 border border-cyan-500/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-cyan-500/60 uppercase tracking-[0.25em]">Inbox</p>
              <h1 className="text-[28px] font-bold text-white tracking-tight">Notifications</h1>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            Derived in-app attention queue for blocked work, contract invites, project invites, assigned work, and approval requests.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-fade-in">
          <StatCard label="Total" value={counts.total} tone="cyan" />
          <StatCard label="Blockers" value={counts.blockers} tone="rose" />
          <StatCard label="Contracts + projects" value={counts.contracts + counts.projects} tone="violet" />
          <StatCard label="Approvals" value={counts.approvals} tone="amber" />
        </div>

        <div className="rounded-2xl glass-card overflow-hidden animate-fade-in">
          <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Actionable items</h2>
              <p className="text-[11px] text-gray-600 mt-1">Auto-refreshing every 10 seconds.</p>
            </div>
            <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/[0.08] border border-cyan-500/20 px-2 py-1 rounded-lg">
              {items.length} visible
            </span>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.04] mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Nothing needs attention</p>
              <p className="text-[11px] text-gray-700 mt-1">A rare and suspiciously pleasant state of affairs.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block px-5 py-4 hover:bg-white/[0.02] transition-colors duration-200"
                >
                  <div className="flex items-start gap-3 justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${kindStyles[item.kind]}`}>
                          {item.kind.replace('-', ' ')}
                        </span>
                        {item.meta && <span className="text-[11px] text-gray-600">{item.meta}</span>}
                      </div>
                      <p className="text-[14px] font-semibold text-white">{item.title}</p>
                      <p className="text-[13px] text-gray-400 mt-1">{item.body}</p>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <p className="text-[11px] font-mono text-gray-600">{formatDate(item.createdAt)}</p>
                      <p className="text-[11px] text-cyan-400 mt-1">Open →</p>
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

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'cyan' | 'violet' | 'amber' | 'rose' }) {
  const tones = {
    cyan: 'from-cyan-500/[0.08] to-blue-500/[0.08] border-cyan-500/10 text-cyan-400',
    violet: 'from-violet-500/[0.08] to-fuchsia-500/[0.08] border-violet-500/10 text-violet-400',
    amber: 'from-amber-500/[0.08] to-orange-500/[0.08] border-amber-500/10 text-amber-400',
    rose: 'from-rose-500/[0.08] to-red-500/[0.08] border-rose-500/10 text-rose-300',
  } as const;

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${tones[tone]} px-4 py-4`}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 font-semibold">{label}</p>
      <p className="text-[28px] font-bold mt-2 text-white">{value}</p>
    </div>
  );
}

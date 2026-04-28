'use client';

import { useState, useCallback } from 'react';
import Sidebar from './sidebar';
import { Topbar } from './topbar';
import { CommandPalette } from './command-palette';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';
import { DashboardProvider, type DashboardContextValue } from '@/app/(dashboard)/dashboard-context';
import ActingAgentSelector from '@/app/(dashboard)/acting-agent-selector';

const TICKER_ITEMS = [
  { tone: 'mint', actor: 'system', type: 'webhook.delivery.success', time: '4m' },
  { tone: 'peri', actor: 'clawdius', type: 'message.send', time: '6m' },
  { tone: 'mint', actor: 'system', type: 'webhook.delivery.success', time: '7m' },
  { tone: 'peri', actor: 'clawdius', type: 'message.send', time: '9m' },
  { tone: 'rose', actor: 'system', type: 'webhook.delivery.failed', time: '12m' },
  { tone: 'mint', actor: 'system', type: 'webhook.delivery.success', time: '14m' },
  { tone: 'mint', actor: 'clawdius', type: 'contract.signed', time: '18m' },
  { tone: 'amber', actor: 'clawdius', type: 'contract.proposed', time: '24m' },
];

interface DashboardShellProps extends DashboardContextValue {
  children: React.ReactNode;
}

export default function DashboardShell({ isSuperAdmin, displayName, notificationCounts, actor, children }: DashboardShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleCloseSidebar = useCallback(() => {}, []);

  const dashboardContext: DashboardContextValue = {
    isSuperAdmin,
    displayName,
    notificationCounts,
    actor,
  };

  return (
    <DashboardProvider value={dashboardContext}>
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        displayName={displayName}
        notificationCounts={notificationCounts}
        onClose={handleCloseSidebar}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
        <Topbar
          tickerItems={TICKER_ITEMS}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ padding: '4px 16px 0' }}>
              <ActingAgentSelector />
            </div>
            {children}
          </div>
        </div>
      </main>
      <CommandPalette open={paletteOpen} onClose={setPaletteOpen} />
    </DashboardProvider>
  );
}

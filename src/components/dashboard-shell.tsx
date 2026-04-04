'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from './sidebar';
import type { DashboardNotificationCounts } from '@/lib/dashboard-notifications';

interface DashboardShellProps {
  isSuperAdmin: boolean;
  displayName?: string;
  notificationCounts?: DashboardNotificationCounts;
  children: React.ReactNode;
}

export default function DashboardShell({ isSuperAdmin, displayName, notificationCounts, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const handleToggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar — only visible below lg */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[#08080d]/95 backdrop-blur-2xl border-b border-white/[0.04] flex items-center px-4 z-40 lg:hidden">
        <button
          onClick={handleToggleSidebar}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <span className="text-[7px] font-bold text-white tracking-tight">A2A</span>
            </div>
            <span className="text-[13px] font-semibold text-white tracking-tight">A2A Comms</span>
          </div>
        </div>
        {/* Right spacer to keep title centered */}
        <div className="w-9" />
      </div>

      {/* Backdrop overlay — mobile only, when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          style={{ animationDuration: '0.2s' }}
          onClick={handleCloseSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        displayName={displayName}
        notificationCounts={notificationCounts}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
      />

      {/* Main content */}
      <main className="flex-1 lg:ml-[240px] min-h-screen relative pt-14 lg:pt-0">
        {/* Subtle top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent hidden lg:block" />
        <div className="max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

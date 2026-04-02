'use client';

import { useState, useCallback } from 'react';
import { requestKillSwitchActivation, executeKillSwitchActivation, deactivateKillSwitch, getKillSwitchStatus } from './actions';
import { formatDateTime } from '@/lib/format-date';

interface KillSwitchClientProps {
  isSuperAdmin: boolean;
  initialStatus: {
    enabled: boolean;
    updated_at: string | null;
    updated_by: string | null;
  };
}

export default function KillSwitchClient({ isSuperAdmin, initialStatus }: KillSwitchClientProps) {
  const [isActive, setIsActive] = useState<boolean | null>(initialStatus.enabled);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialStatus.updated_at);
  const [updatedBy, setUpdatedBy] = useState<string | null>(initialStatus.updated_by);

  const loadStatus = useCallback(async () => {
    try {
      const status = await getKillSwitchStatus();
      setIsActive(status.enabled);
      setLastUpdated(status.updated_at);
      setUpdatedBy(status.updated_by);
    } catch {
      setIsActive(false);
    }
  }, []);

  async function handleActivate() {
    setLoading(true);
    try {
      // First try to execute if there's an approved request
      try {
        await executeKillSwitchActivation();
        setIsActive(true);
        setConfirming(false);
        await loadStatus();
        setLoading(false);
        return;
      } catch {
        // No approved request — submit a new one
      }
      await requestKillSwitchActivation();
      setConfirming(false);
      alert('Kill switch activation requires approval from another admin. A request has been submitted to the Approvals page.');
      await loadStatus();
    } catch (err) {
      console.error('Failed to activate kill switch:', err);
    }
    setLoading(false);
  }

  async function handleDeactivate() {
    setLoading(true);
    try {
      await deactivateKillSwitch();
      setIsActive(false);
      setConfirming(false);
      await loadStatus();
    } catch (err) {
      console.error('Failed to deactivate kill switch:', err);
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center h-[85vh] relative">
      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{
          background: isActive
            ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.05) 35%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 35%, transparent 70%)',
        }}
      />

      <div className="text-center max-w-lg relative z-10">
        {/* Status orb visualization */}
        <div className="relative inline-flex items-center justify-center mb-12">
          {isActive && (
            <>
              <div className="absolute w-56 h-56 rounded-full ring-pulse-red border border-red-500/10" />
              <div className="absolute w-56 h-56 rounded-full ring-pulse-red border border-red-500/10" style={{ animationDelay: '0.5s' }} />
              <div className="absolute w-56 h-56 rounded-full ring-pulse-red border border-red-500/10" style={{ animationDelay: '1s' }} />
            </>
          )}

          <div className={`absolute w-48 h-48 rounded-full transition-all duration-1000 ${
            isActive
              ? 'bg-red-500/[0.06] shadow-[0_0_100px_40px_rgba(239,68,68,0.08)]'
              : 'bg-emerald-500/[0.04] shadow-[0_0_80px_30px_rgba(16,185,129,0.05)]'
          }`} />

          <div className={`absolute w-40 h-40 rounded-full border transition-all duration-700 ${
            isActive
              ? 'border-red-500/20'
              : 'border-emerald-500/10'
          } ${isActive ? 'animate-pulse' : ''}`} />

          <div className={`absolute w-32 h-32 rounded-full border transition-all duration-700 ${
            isActive
              ? 'border-red-500/10'
              : 'border-emerald-500/[0.06]'
          }`} />

          <div className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-700 ${
            isActive
              ? 'bg-gradient-to-br from-red-500/20 to-red-700/20 border-2 border-red-500/25 orb-danger'
              : 'bg-gradient-to-br from-emerald-500/15 to-green-600/15 border-2 border-emerald-500/15 orb-safe'
          }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-700 ${
              isActive
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-[0_0_50px_15px_rgba(239,68,68,0.3)]'
                : 'bg-gradient-to-br from-emerald-500 to-green-500 shadow-[0_0_40px_10px_rgba(16,185,129,0.2)]'
            }`}>
              {isActive ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Status text */}
        <h1 className={`text-3xl font-black tracking-tight mb-2 transition-colors duration-700 ${
          isActive ? 'text-red-400 text-glow-red' : 'text-emerald-400 text-glow-emerald'
        }`}>
          {isActive ? 'KILL SWITCH ACTIVE' : 'SYSTEM OPERATIONAL'}
        </h1>
        <p className="text-[13px] text-gray-500 mb-2 max-w-sm mx-auto leading-relaxed">
          {isActive
            ? 'All contracts are frozen. API write operations are blocked.'
            : 'System is accepting requests normally. All channels open.'}
        </p>
        {lastUpdated && (
          <p className="text-[10px] text-gray-700 mb-10 font-mono tabular-nums">
            Last updated: {formatDateTime(lastUpdated)}
            {updatedBy && <span className="text-gray-600"> · {updatedBy}</span>}
          </p>
        )}

        {/* Action — only for super admins */}
        {isSuperAdmin ? (
          confirming ? (
            <div className="rounded-2xl glass-card p-7 max-w-sm mx-auto animate-fade-in" style={{ animationDuration: '0.2s' }}>
              <p className={`text-[13px] font-semibold mb-6 ${isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isActive
                  ? 'Resume normal system operations?'
                  : '⚠️ This will freeze ALL contracts and block API writes.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="flex-1 px-4 py-3 text-[12px] font-semibold rounded-xl border border-white/[0.06] text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={isActive ? handleDeactivate : handleActivate}
                  disabled={loading}
                  className={`flex-1 px-4 py-3 text-[12px] font-bold rounded-xl transition-all duration-300 disabled:opacity-50 ${
                    isActive
                      ? 'bg-emerald-500/[0.1] border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/[0.2] hover:shadow-[0_0_25px_rgba(16,185,129,0.12)]'
                      : 'bg-red-500/[0.1] border border-red-500/20 text-red-400 hover:bg-red-500/[0.2] hover:shadow-[0_0_25px_rgba(239,68,68,0.12)]'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className={`w-3.5 h-3.5 border-2 rounded-full animate-spin ${
                        isActive ? 'border-emerald-400/30 border-t-emerald-400' : 'border-red-400/30 border-t-red-400'
                      }`} />
                      Processing…
                    </span>
                  ) : (
                    isActive ? 'Deactivate' : 'Activate'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className={`group relative px-10 py-4 text-[14px] font-bold rounded-2xl transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] ${
                isActive
                  ? 'bg-emerald-500/[0.06] border-2 border-emerald-500/15 text-emerald-400 hover:bg-emerald-500/[0.12] hover:border-emerald-500/30 hover:shadow-[0_0_50px_rgba(16,185,129,0.1)]'
                  : 'bg-red-500/[0.06] border-2 border-red-500/15 text-red-400 hover:bg-red-500/[0.12] hover:border-red-500/30 hover:shadow-[0_0_50px_rgba(239,68,68,0.1)]'
              }`}
            >
              <span className="relative z-10">
                {isActive ? '✓ Deactivate Kill Switch' : '⊘ Activate Kill Switch'}
              </span>
            </button>
          )
        ) : (
          <div className="rounded-2xl glass-card p-5 max-w-sm mx-auto">
            <p className="text-[11px] text-gray-600 font-medium">
              Only administrators can control the kill switch.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

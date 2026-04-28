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
      await executeKillSwitchActivation();
      setIsActive(true);
      setConfirming(false);
      alert('Kill switch activated. Admin-triggered activations are auto-approved.');
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '85vh',
      position: 'relative',
    }}>
      {/* Background radial glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transition: 'opacity 1s',
          background: isActive
            ? 'radial-gradient(ellipse at center, var(--rose-bg) 0%, transparent 60%)'
            : 'radial-gradient(ellipse at center, var(--mint-bg) 0%, transparent 60%)',
        }}
      />

      <div style={{ textAlign: 'center', maxWidth: 460, position: 'relative', zIndex: 1 }}>
        {/* Status orb visualization */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 48 }}>
          {/* Outer glow layers */}
          <div style={{
            position: 'absolute',
            width: 192,
            height: 192,
            borderRadius: '50%',
            border: `1px solid ${isActive ? 'oklch(0.40 0.08 25 / 0.15)' : 'oklch(0.50 0.10 165 / 0.12)'}`,
            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
          <div style={{
            position: 'absolute',
            width: 192,
            height: 192,
            borderRadius: '50%',
            border: `1px solid ${isActive ? 'oklch(0.40 0.08 25 / 0.10)' : 'oklch(0.50 0.10 165 / 0.08)'}`,
            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
            animationDelay: '0.5s',
          }} />

          <div style={{
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: '50%',
            transition: 'all 1s',
            background: isActive
              ? 'radial-gradient(circle, var(--rose-bg), transparent)'
              : 'radial-gradient(circle, var(--mint-bg), transparent)',
          }} />

          <div style={{
            position: 'absolute',
            width: 128,
            height: 128,
            borderRadius: '50%',
            border: `1px solid ${isActive ? 'oklch(0.40 0.08 25 / 0.25)' : 'oklch(0.50 0.10 165 / 0.18)'}`,
            transition: 'all 0.7s',
            animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />

          {/* Core orb */}
          <div style={{
            position: 'relative',
            width: 96,
            height: 96,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.7s',
            background: isActive
              ? 'radial-gradient(135deg, var(--rose-bg), oklch(0.25 0.06 25))'
              : 'radial-gradient(135deg, var(--mint-bg), oklch(0.25 0.06 165))',
            border: `2px solid ${isActive ? 'oklch(0.45 0.10 25 / 0.4)' : 'oklch(0.50 0.10 165 / 0.3)'}`,
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.7s',
              background: isActive ? 'var(--rose)' : 'var(--mint)',
              boxShadow: isActive
                ? '0 0 40px 12px var(--rose-bg)'
                : '0 0 32px 8px var(--mint-bg)',
            }}>
              {isActive ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Status text */}
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: 8,
          transition: 'color 0.7s',
          color: isActive ? 'var(--rose)' : 'var(--mint)',
        }}>
          {isActive ? 'KILL SWITCH ACTIVE' : 'SYSTEM OPERATIONAL'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 8, maxWidth: 360, margin: '0 auto 8px', lineHeight: 1.6 }}>
          {isActive
            ? 'All contracts are frozen. API write operations are blocked.'
            : 'System is accepting requests normally. All channels open.'}
        </p>
        {lastUpdated && (
          <p className="mono num" style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 40 }}>
            Last updated: {formatDateTime(lastUpdated)}
            {updatedBy && <span style={{ color: 'var(--fg-4)' }}> · {updatedBy}</span>}
          </p>
        )}

        {/* Action — only for super admins */}
        {isSuperAdmin ? (
          confirming ? (
            <div className="card animate-fade-in" style={{ padding: 28, maxWidth: 360, margin: '0 auto' }}>
              <p style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 24,
                color: isActive ? 'var(--mint)' : 'var(--rose)',
              }}>
                {isActive
                  ? 'Resume normal system operations?'
                  : 'This will freeze ALL contracts and block API writes.'}
              </p>
              <div className="row gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="btn btn--ghost"
                  style={{ flex: 1, justifyContent: 'center', height: 40 }}
                >
                  Cancel
                </button>
                <button
                  onClick={isActive ? handleDeactivate : handleActivate}
                  disabled={loading}
                  className="btn"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    height: 40,
                    fontWeight: 700,
                    background: isActive ? 'var(--mint-bg)' : 'var(--rose-bg)',
                    borderColor: isActive ? 'oklch(0.50 0.10 165 / 0.4)' : 'oklch(0.40 0.08 25 / 0.4)',
                    color: isActive ? 'var(--mint)' : 'var(--rose)',
                    transition: 'all 0.3s',
                  }}
                >
                  {loading ? (
                    <span className="row gap-2">
                      <span style={{
                        width: 14,
                        height: 14,
                        border: '2px solid var(--line-2)',
                        borderTopColor: isActive ? 'var(--mint)' : 'var(--rose)',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                        display: 'inline-block',
                      }} />
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
              className="btn"
              style={{
                height: 48,
                padding: '0 40px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                background: isActive ? 'var(--mint-bg)' : 'var(--rose-bg)',
                borderColor: isActive ? 'oklch(0.50 0.10 165 / 0.3)' : 'oklch(0.40 0.08 25 / 0.3)',
                color: isActive ? 'var(--mint)' : 'var(--rose)',
                transition: 'all 0.5s',
              }}
            >
              {isActive ? 'Deactivate Kill Switch' : 'Activate Kill Switch'}
            </button>
          )
        ) : (
          <div className="card" style={{ padding: 20, maxWidth: 360, margin: '0 auto' }}>
            <p style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 500 }}>
              Only administrators can control the kill switch.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Search, RefreshCw, Bell } from 'lucide-react';
import { Ticker } from '@/components/atoms';

interface TopbarProps {
  tickerItems?: Array<{ tone: string; actor: string; type: string; time: string }>;
  onOpenPalette: () => void;
}

export const Topbar = ({ tickerItems, onOpenPalette }: TopbarProps) => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      height: 44,
      borderBottom: '1px solid var(--line-1)',
      background: 'oklch(0.15 0.012 250 / 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 14px',
      gap: 14,
      flexShrink: 0,
    }}>
      {/* Command palette trigger */}
      <button
        onClick={onOpenPalette}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 28,
          padding: '0 10px',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderRadius: 6,
          color: 'var(--fg-3)',
          fontFamily: 'var(--sans)',
          fontSize: 12,
          cursor: 'pointer',
          width: 320,
        }}
      >
        <Search size={13} />
        <span style={{ flex: 1, textAlign: 'left' }}>Search or run command…</span>
        <span className="kbd">⌘</span>
        <span className="kbd">K</span>
      </button>

      {/* Ticker */}
      {tickerItems && tickerItems.length > 0 ? (
        <Ticker items={tickerItems} />
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Right side */}
      <div className="row gap-3" style={{ alignItems: 'center' }}>
        {/* LIVE indicator */}
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <span className="dot dot--mint pulse" />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live</span>
        </div>

        {/* UTC clock */}
        <div className="mono num" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{time} UTC</div>

        <div style={{ width: 1, height: 18, background: 'var(--line-1)' }} />

        <button className="btn btn--ghost btn--sm btn--icon" title="Refresh" style={{ width: 26, height: 26 }}>
          <RefreshCw size={13} />
        </button>
        <button className="btn btn--ghost btn--sm btn--icon" title="Notifications" style={{ position: 'relative', width: 26, height: 26 }}>
          <Bell size={13} />
          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 5,
            height: 5,
            borderRadius: 999,
            background: 'var(--amber)',
          }} />
        </button>
      </div>
    </div>
  );
};

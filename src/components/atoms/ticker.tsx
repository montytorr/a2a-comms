'use client';

import { useState, useEffect, useRef } from 'react';

interface TickerItem {
  tone: string;
  actor: string;
  type: string;
  time: string;
}

interface TickerProps {
  items: TickerItem[];
  paused?: boolean;
}

export const Ticker = ({ items, paused = false }: TickerProps) => {
  const [offset, setOffset] = useState(0);
  const rafRef = useRef<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || items.length === 0) return;
    const tick = () => {
      setOffset(o => {
        const contentWidth = contentRef.current?.scrollWidth ?? 0;
        const halfWidth = contentWidth / 2;
        const next = o + 0.4;
        return halfWidth > 0 && next >= halfWidth ? next - halfWidth : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, items.length]);

  const list = [...items, ...items];

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
      height: 22,
      maskImage: 'linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)',
    }}>
      <div ref={contentRef} style={{
        display: 'flex',
        gap: 28,
        transform: `translateX(${-offset}px)`,
        whiteSpace: 'nowrap',
        position: 'absolute',
        alignItems: 'center',
        height: '100%',
      }}>
        {list.map((it, i) => (
          <span key={i} className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span className={`dot dot--${it.tone}`} />
            <span style={{ color: 'var(--fg-3)' }}>{it.actor}</span>
            <span style={{ color: 'var(--fg-1)' }}>{it.type}</span>
            <span style={{ color: 'var(--fg-3)' }}>{it.time} ago</span>
          </span>
        ))}
      </div>
    </div>
  );
};

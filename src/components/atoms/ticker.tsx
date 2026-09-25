'use client';

import { useEffect, useRef } from 'react';

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

/* The marquee used to call setOffset on every animation frame, which
   re-rendered the whole topbar subtree at 60fps for the life of the session,
   and read contentRef.scrollWidth inside the state updater — a forced reflow
   every frame. It also ran while the tab was hidden, and ignored
   prefers-reduced-motion, which globals.css respects for every other
   animation in the app.

   It now writes the transform straight to the node, measures the track only
   when the items or the size change, and stops when it should. */
export const Ticker = ({ items, paused = false }: TickerProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || paused || items.length === 0) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (reduced?.matches) return;

    let raf = 0;
    let offset = 0;
    /* The track is the item list twice over, so half of it is one full loop.
       Measured here and on resize rather than per frame. */
    let halfWidth = node.scrollWidth / 2;
    const measure = () => { halfWidth = node.scrollWidth / 2; };

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    let last = performance.now();
    const step = (now: number) => {
      /* Time-based, so the speed does not depend on the refresh rate. The
         old fixed 0.4px per frame ran twice as fast on a 120Hz display. */
      const delta = Math.min(now - last, 100);
      last = now;
      if (halfWidth > 0) {
        offset = (offset + (delta * 0.024)) % halfWidth;
        node.style.transform = `translateX(${-offset}px)`;
      }
      raf = requestAnimationFrame(step);
    };

    const start = () => { last = performance.now(); raf = requestAnimationFrame(step); };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const onVisibility = () => { if (document.hidden) stop(); else if (!raf) start(); };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [paused, items]);

  const list = [...items, ...items];
  const mask = 'linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)';

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
      height: 22,
      maskImage: mask,
      /* Safari still wants the prefix, so the edge fade was simply absent there. */
      WebkitMaskImage: mask,
    }}>
      <div ref={contentRef} style={{
        display: 'flex',
        gap: 28,
        whiteSpace: 'nowrap',
        position: 'absolute',
        alignItems: 'center',
        height: '100%',
      }}>
        {list.map((it, i) => (
          <span key={i} className="mono text-2xs" style={{ color: 'var(--fg-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span className={`dot dot--${it.tone}`} />
            <span style={{ color: 'var(--fg-3)' }}>{it.actor}</span>
            <span style={{ color: 'var(--fg-1)' }}>{it.type}</span>
            <span style={{ color: 'var(--fg-3)' }}>{it.time === 'just now' ? it.time : `${it.time} ago`}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

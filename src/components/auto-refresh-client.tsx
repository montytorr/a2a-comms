'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useRef, useState } from 'react';
import {
  RELOAD_WINDOW_MS,
  decideAction,
  isStale,
  recentReloads,
  type BuildComparison,
} from '@/lib/refresh-watchdog';
import { changedKeys, type Pulse, type PulseKey } from '@/lib/pulse';

interface AutoRefreshClientProps {
  intervalMs: number;
  onlyWhenVisible: boolean;
  /**
   * When the server rendered the tree around this component. A new value is the
   * only proof a refresh actually landed: `router.refresh()` returns void and
   * reports nothing, so without this the component cannot tell a working page
   * from a frozen one.
   */
  renderedAt: number;
  /** The version this bundle was built from, baked in at build time. */
  buildVersion: string;
  /**
   * The domains this page displays. A change in one of them is what earns a
   * re-render; anything else is churn without information.
   */
  watch: readonly PulseKey[];
  children: React.ReactNode;
}

/** Never check the served build more often than this. */
const BUILD_CHECK_MS = 30_000;
/** The log survives the reload it records, which is the point of storing it. */
const RELOAD_LOG_KEY = 'a2a:auto-reloads';

function readReloadLog(): number[] {
  try {
    const raw = sessionStorage.getItem(RELOAD_LOG_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function reloadNow(log: number[]) {
  try {
    sessionStorage.setItem(
      RELOAD_LOG_KEY,
      JSON.stringify([...recentReloads(log, Date.now()), Date.now()])
    );
  } catch {
    // A tab with no session storage still deserves the reload.
  }
  window.location.reload();
}

type Status = 'live' | 'stale' | 'stuck';

export default function AutoRefreshClient({
  intervalMs,
  onlyWhenVisible,
  renderedAt,
  buildVersion,
  watch,
  children,
}: AutoRefreshClientProps) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisible = useRef(true);
  // Both start at 0 so the first effect run records them; calling Date.now()
  // in a ref initialiser would be running an impure function during render.
  const lastServerRenderSeenAt = useRef(0);
  const lastRenderedAt = useRef(0);
  const lastBuildCheckAt = useRef(0);
  const [status, setStatus] = useState<Status>('live');
  const [ageSeconds, setAgeSeconds] = useState(0);
  const [streaming, setStreaming] = useState(false);

  // A new renderedAt is proof the round trip completed and the tree committed.
  // Only refs are touched here: the next tick reads them and is the single
  // place that decides what to display, which keeps one source of truth and
  // avoids a cascading render on every refresh.
  useEffect(() => {
    if (renderedAt === lastRenderedAt.current) return;
    lastRenderedAt.current = renderedAt;
    lastServerRenderSeenAt.current = Date.now();
  }, [renderedAt]);

  /**
   * Has the server moved to a different build than this bundle?
   *
   * A deploy makes every open tab's build id stale. Next reacts by calling
   * `location.replace` and then infinitely suspending the React root - and if
   * that navigation does not land, the tab is frozen with its timer still
   * running into a guard that swallows every refresh. Reloading deliberately,
   * the moment the version changes, gets there first.
   */
  const checkBuild = useCallback(async (): Promise<'same' | 'moved' | 'unknown'> => {
    lastBuildCheckAt.current = Date.now();
    try {
      const res = await fetch('/api/internal/build', { cache: 'no-store' });
      if (!res.ok) return 'unknown';
      const body = (await res.json()) as { version?: string };
      if (!body.version || body.version === 'unknown') return 'unknown';
      return body.version === buildVersion ? 'same' : 'moved';
    } catch {
      return 'unknown';
    }
  }, [buildVersion]);

  const doRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  /**
   * Listen for the server saying something moved.
   *
   * This is the mechanism; the timer below is now only a fallback for when the
   * stream is unavailable. A timer re-renders the page whether or not anything
   * changed, and twenty pages were doing that every ten to fifteen seconds.
   */
  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let previous: Pulse | null = null;

    const connect = () => {
      source = new EventSource('/api/internal/pulse');

      source.addEventListener('pulse', (event) => {
        const next = JSON.parse((event as MessageEvent).data) as Pulse;
        attempt = 0;
        setStreaming(true);
        // The first frame is a baseline, not a change. Refreshing on it would
        // make every page load cost an immediate second render.
        if (previous !== null && changedKeys(previous, next, watch).length > 0) {
          lastServerRenderSeenAt.current = Date.now();
          doRefresh();
        }
        previous = next;
      });

      source.addEventListener('bye', () => {
        // The server is retiring this connection deliberately, usually because
        // it has been open long enough to outlive a deploy. Reconnect at once.
        source?.close();
        source = null;
        connect();
      });

      source.onerror = () => {
        source?.close();
        source = null;
        setStreaming(false);
        // Backed off, because a server that is down would otherwise be
        // reconnected to by every open tab several times a second.
        attempt += 1;
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      };
    };

    connect();

    return () => {
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [doRefresh, watch]);

  useEffect(() => {
    const tick = async () => {
      if (onlyWhenVisible && !isVisible.current) return;

      const sinceServerRender = Date.now() - lastServerRenderSeenAt.current;
      const stale = isStale(sinceServerRender, intervalMs);
      setAgeSeconds(Math.round(sinceServerRender / 1000));

      // Check the served build when the page looks stuck, and periodically
      // anyway: a deploy breaks a tab that still looks perfectly healthy, so
      // waiting for it to look broken waits too long.
      let build: BuildComparison = 'unknown';
      if (stale || Date.now() - lastBuildCheckAt.current > BUILD_CHECK_MS) {
        build = await checkBuild();
      }

      const action = decideAction({
        visible: isVisible.current,
        sinceServerRenderMs: sinceServerRender,
        intervalMs,
        build,
        reloadLog: readReloadLog(),
        now: Date.now(),
      });

      if (action === 'reload') return reloadNow(readReloadLog());
      if (action === 'give-up') return setStatus('stuck');
      if (action === 'idle') return;

      setStatus((current) => (current === 'stuck' ? current : stale ? 'stale' : 'live'));
      // With the stream connected, the server says when something moved, so a
      // timed refresh would be the churn this was built to remove. The timer
      // stays for the watchdog above, and for when the stream is down.
      if (!streaming) doRefresh();
    };

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => void tick(), intervalMs);
    }

    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible';
      if (!isVisible.current) return;
      // Nothing was refreshing while hidden, so the clock restarts here rather
      // than counting the time away as staleness.
      lastServerRenderSeenAt.current = Date.now();
      void tick();
    };

    // The previous version assumed the tab was visible at mount and never
    // checked, so a page opened in a background tab polled regardless.
    isVisible.current = document.visibilityState === 'visible';
    document.addEventListener('visibilitychange', handleVisibility);
    // A tab restored from the back-forward cache does not reliably fire
    // visibilitychange, and comes back with whatever it had on screen.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) handleVisibility();
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [doRefresh, checkBuild, intervalMs, onlyWhenVisible, streaming]);

  const tone = status === 'live' ? 'mint' : status === 'stale' ? 'amber' : 'rose';
  const label = status === 'live' ? 'Live' : status === 'stale' ? 'Not updating' : 'Reload needed';

  return (
    <div style={{ position: 'relative' }}>
      <div className="auto-refresh-indicator row gap-2">
        <span className={`dot dot--${tone} ${status === 'live' ? 'pulse' : ''}`} />
        <span
          className="mono text-2xs"
          style={{
            color: `var(--${tone})`,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
          title={
            status === 'stuck'
              ? 'This page reloaded itself repeatedly and stopped trying. Reload manually.'
              : `Server data last seen ${ageSeconds}s ago`
          }
        >
          {label}
        </span>
        <span className="mono num dim text-2xs">
          {status === 'live' ? (streaming ? 'streaming' : `${Math.round(intervalMs / 1000)}s`) : `${ageSeconds}s ago`}
        </span>
      </div>
      {children}
    </div>
  );
}

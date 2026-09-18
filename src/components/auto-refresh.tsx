import AutoRefreshClient from './auto-refresh-client';
import { PULSE_KEYS, type PulseKey } from '@/lib/pulse';

interface AutoRefreshProps {
  /** Fallback cadence, used only while the pulse stream is unavailable. */
  intervalMs?: number;
  onlyWhenVisible?: boolean;
  /**
   * The domains this page displays. Watching everything means re-rendering a
   * contract page because an unrelated webhook was delivered — churn without
   * information — so each page names what it actually shows.
   */
  watch?: readonly PulseKey[];
  children: React.ReactNode;
}

/**
 * Keeps a server-rendered page current, and says so honestly.
 *
 * Two things had to change. A page could not tell whether it was up to date:
 * `router.refresh()` returns void, so the badge was a 600ms animation that read
 * "Live" whether the last refresh worked, failed, or never happened — including
 * when a deploy had frozen the tab entirely. And a page re-rendered on a timer
 * whether or not anything had changed, twenty pages at ten to fifteen seconds.
 *
 * So: this is a *server* component, because `Date.now()` here runs on every
 * server render and a new value is the proof the client needs that a refresh
 * landed. And the client subscribes to a pulse stream that says only THAT
 * something moved, re-rendering through the normal server path when it does.
 * Being a server wrapper means the fifteen call sites gained all of it without
 * changing.
 */
export default function AutoRefresh({
  intervalMs = 15000,
  onlyWhenVisible = true,
  watch = PULSE_KEYS,
  children,
}: AutoRefreshProps) {
  return (
    <AutoRefreshClient
      intervalMs={intervalMs}
      onlyWhenVisible={onlyWhenVisible}
      // A fresh value per request is the entire mechanism: it is what proves to
      // the client that a refresh landed. The purity rule is about client
      // components re-rendering unpredictably; this is a server component and
      // runs once per request, which is exactly the property being used.
      // eslint-disable-next-line react-hooks/purity
      renderedAt={Date.now()}
      buildVersion={process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown'}
      watch={watch}
    >
      {children}
    </AutoRefreshClient>
  );
}

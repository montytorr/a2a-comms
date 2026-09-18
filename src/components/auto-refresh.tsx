import AutoRefreshClient from './auto-refresh-client';

interface AutoRefreshProps {
  intervalMs?: number;
  onlyWhenVisible?: boolean;
  children: React.ReactNode;
}

/**
 * Keeps a server-rendered page current, and says so honestly.
 *
 * This is a *server* component wrapping the client one, for a single reason:
 * `Date.now()` here runs on every server render, so a new value is proof the
 * refresh landed. `router.refresh()` returns void and reports nothing, so
 * without that proof the client cannot tell a page that is quietly up to date
 * from one that stopped re-rendering half an hour ago — which is what the badge
 * used to claim either way, since it was a 600ms animation timer and nothing
 * more.
 *
 * Being a server component also means the fifteen call sites did not have to
 * change to gain any of it.
 */
export default function AutoRefresh({
  intervalMs = 15000,
  onlyWhenVisible = true,
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
    >
      {children}
    </AutoRefreshClient>
  );
}

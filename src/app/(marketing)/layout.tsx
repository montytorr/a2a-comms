/**
 * The public surface: no sidebar, no ticker, no session.
 *
 * It is a separate route group from `(dashboard)` because the dashboard's
 * layout fetches the notification summary and seeds the live feed on every
 * render — work that needs an authenticated actor and would be wasted on a
 * visitor who has never signed in.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Whether anything a dashboard page displays has actually moved.
 *
 * Polling re-renders a page on a timer whether or not anything changed. This is
 * the cheaper question: one query returns a fingerprint per domain, a page
 * subscribes to the keys it displays, and only a change in one of those keys
 * costs a re-render.
 *
 * The rule that matters most here is inherited from CAIRN-152: a failed read
 * must return a CONSTANT rather than something new. A fingerprint that changes
 * because the database hiccupped would refresh every open tab, on every tick,
 * for as long as the hiccup lasted.
 *
 * This half is pure on purpose: the client component compares fingerprints, and
 * anything it imports is bundled for the browser. Reading the pulse needs a
 * database driver, so it lives in pulse-server.ts.
 */

/**
 * Domains, not tables. Each is the union of the tables a page showing that
 * domain renders — task runs and comments move `tasks`, sprints and membership
 * invitations move `projects`, contract links move `contracts` — because a page
 * displaying something no fingerprint covers would silently never update for
 * it, which is the bug this exists to fix, reintroduced.
 */
export const PULSE_KEYS = [
  'contracts',
  'participants',
  'messages',
  'tasks',
  'projects',
  'approvals',
  'agents',
  'audit',
  'webhooks',
] as const;

export type PulseKey = (typeof PULSE_KEYS)[number];
export type Pulse = Partial<Record<PulseKey, string>>;

/**
 * What a failed read returns. Not an empty object — an empty object differs
 * from a real reading, and "differs" is exactly what must not happen.
 */
export const PULSE_UNAVAILABLE: Pulse = Object.freeze({});

export function isUnavailable(pulse: Pulse): boolean {
  return Object.keys(pulse).length === 0;
}

/**
 * Which of the watched keys moved.
 *
 * An unavailable reading on either side yields nothing: no information is not
 * the same as no change, but it is the safe way to treat it — a page that
 * refuses to refresh for a few seconds is recoverable, a page that refreshes
 * every tick because the database is unhappy is a stampede.
 */
export function changedKeys(previous: Pulse, next: Pulse, watch: readonly PulseKey[]): PulseKey[] {
  if (isUnavailable(previous) || isUnavailable(next)) return [];
  return watch.filter((key) => previous[key] !== next[key]);
}

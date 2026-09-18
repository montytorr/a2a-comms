/**
 * When a page has stopped updating, and what to do about it.
 *
 * Kept apart from the component because it is the part that can be wrong in a
 * way nobody notices: the failure it guards against is a page that looks
 * perfectly healthy. A deploy gives every open tab a stale build id; Next reacts
 * by calling `location.replace` and then infinitely suspending the React root,
 * and if that navigation does not land the tab is frozen on already-painted DOM
 * with its timer still firing into a guard that swallows every refresh. Nothing
 * in the page can report that, because nothing re-renders.
 */

/** Missed refreshes before "slow" becomes "something is wrong". */
export const STALE_AFTER_TICKS = 3;
/** Reload budget inside the window, so a broken server cannot cause a loop. */
export const RELOAD_WINDOW_MS = 120_000;
export const RELOAD_BUDGET = 3;

export type BuildComparison = 'same' | 'moved' | 'unknown';

export type WatchdogAction =
  /** Normal operation: ask the server for a fresh tree. */
  | 'refresh'
  /** The server is on a different build than this bundle. Start over. */
  | 'reload'
  /** It would reload, but it has already done so too often. Tell the human. */
  | 'give-up'
  /** Nothing is owed: the tab is hidden, so nothing was refreshing anyway. */
  | 'idle';

export function isStale(sinceServerRenderMs: number, intervalMs: number): boolean {
  return sinceServerRenderMs > intervalMs * STALE_AFTER_TICKS;
}

/** Reload timestamps still inside the window. */
export function recentReloads(log: number[], now: number): number[] {
  return log.filter((at) => now - at < RELOAD_WINDOW_MS);
}

export function canReload(log: number[], now: number): boolean {
  return recentReloads(log, now).length < RELOAD_BUDGET;
}

export function decideAction(input: {
  visible: boolean;
  sinceServerRenderMs: number;
  intervalMs: number;
  /** The result of comparing the served build with this one, if it was checked. */
  build: BuildComparison;
  reloadLog: number[];
  now: number;
}): WatchdogAction {
  if (!input.visible) return 'idle';

  // A moved build is decisive whether or not the page looks stale: staying on
  // the old bundle only ends one way, and doing it deliberately beats being
  // dropped into a suspended root.
  if (input.build === 'moved') {
    return canReload(input.reloadLog, input.now) ? 'reload' : 'give-up';
  }

  // Stale with the same build, or with a check that could not be made, means
  // refreshes are failing rather than the server having moved. Keep trying:
  // reloading on a server that is merely unreachable would spend the budget
  // achieving nothing.
  return 'refresh';
}

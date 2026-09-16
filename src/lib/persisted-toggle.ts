import { useCallback, useSyncExternalStore } from 'react';

/**
 * A boolean backed by localStorage, read the way React wants external mutable
 * state read.
 *
 * The obvious alternative — `useState(false)` seeded from localStorage inside
 * an effect — sets state synchronously during the effect, which triggers a
 * cascading render and is what `react-hooks` flags. Seeding the initial state
 * directly from localStorage is worse: it does not exist on the server, so the
 * server and client would render different markup.
 *
 * `useSyncExternalStore` handles both: the server snapshot is the default, the
 * client snapshot is whatever storage says, and the two reconcile without an
 * extra render pass.
 */
const listeners = new Set<() => void>();

const notify = () => { for (const listener of listeners) listener(); };

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // `storage` fires in *other* tabs, which keeps two open windows in step.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

const read = (key: string) => {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode or blocked site data. The default is always survivable.
    return false;
  }
};

export const usePersistedToggle = (key: string): [boolean, () => void] => {
  const value = useSyncExternalStore(
    subscribe,
    useCallback(() => read(key), [key]),
    () => false,
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(key, read(key) ? '0' : '1');
    } catch {
      // Not persisting is survivable; refusing to toggle is not — so fall
      // through to notify() regardless and let this render's value flip.
    }
    notify();
  }, [key]);

  return [value, toggle];
};

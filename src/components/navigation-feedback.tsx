'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationFeedbackValue {
  pending: boolean;
  begin: () => void;
}

const NavigationFeedbackContext = createContext<NavigationFeedbackValue | null>(null);

export function NavigationFeedbackProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [startedPath, setStartedPath] = useState<string | null>(null);
  const pending = startedPath === pathname;

  useEffect(() => {
    if (!pending) return;
    const clear = window.setTimeout(() => setStartedPath(null), 15000);
    return () => window.clearTimeout(clear);
  }, [pending]);

  const begin = useCallback(() => setStartedPath(pathname), [pathname]);
  const value = useMemo(() => ({ pending, begin }), [pending, begin]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && destination.pathname !== pathname) begin();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [begin, pathname]);

  return (
    <NavigationFeedbackContext.Provider value={value}>
      {children}
      {pending && (
        <div className="navigation-progress" role="status" aria-live="polite" aria-label="Loading page" />
      )}
    </NavigationFeedbackContext.Provider>
  );
}

export function useNavigationFeedback() {
  const value = useContext(NavigationFeedbackContext);
  if (!value) throw new Error('Navigation feedback is not available');
  return value;
}

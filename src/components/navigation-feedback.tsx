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
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const clear = window.setTimeout(() => setPending(false), 0);
    return () => window.clearTimeout(clear);
  }, [pathname]);

  const begin = useCallback(() => setPending(true), []);
  const value = useMemo(() => ({ pending, begin }), [pending, begin]);

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

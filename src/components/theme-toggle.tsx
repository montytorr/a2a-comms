'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Both icons are always rendered and CSS decides which is visible, rather
 * than branching on a `mounted` flag. Gating on mount means the control pops
 * in after hydration on every page load, and the branch has to re-render the
 * whole subtree to swap an icon.
 */
export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="btn btn--ghost btn--sm btn--icon"
      style={{ width: 26, height: 26 }}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      <Sun size={13} className="hidden dark:block" aria-hidden />
      <Moon size={13} className="block dark:hidden" aria-hidden />
    </button>
  );
};

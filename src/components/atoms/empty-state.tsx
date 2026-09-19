import { cn } from '@/lib/utils';

/**
 * The one empty state.
 *
 * Twenty list surfaces each invented their own "nothing here" markup: four
 * text sizes (--text-2xs through .h3), three greys (--fg-2 via .muted, --fg-3,
 * --fg-4), two of them italic, two with an icon, and vertical padding running
 * from 0 to 60px. Read down the dashboard and the absence of data looked like
 * twenty different kinds of absence.
 *
 * One treatment, chosen once and used everywhere:
 *
 *   padding   var(--space-6) block / var(--space-4) inline — an empty panel
 *             should read as deliberately empty, not as a collapsed one
 *   headline  --text-sm at 600 in --fg-1; a subsection heading (.h4, 16px)
 *             would outrank the panel title the state sits under
 *   hint      --text-xs in --fg-3, capped near 44ch so it wraps as a sentence
 *   icon      optional, --fg-3, so it never competes with the headline
 *
 * `tone="error"` keeps a failed load distinguishable from a genuinely empty
 * one: same geometry, rose ink. Pair it with SectionHeader's `sub` so the
 * failure is legible from the page header too, not only from the panel body.
 */
interface EmptyStateProps {
  /** Optional glyph. Size it at 20 — lucide's `size={20}` — for a consistent mass. */
  icon?: React.ReactNode;
  /** What is absent, stated plainly. Not a sentence and not punctuated. */
  title: string;
  /** One line on why it is absent, or what would fill it. */
  hint?: React.ReactNode;
  /** The action that would end the emptiness, if there is one. */
  action?: React.ReactNode;
  tone?: 'default' | 'error';
  className?: string;
}

export const EmptyState = ({
  icon,
  title,
  hint,
  action,
  tone = 'default',
  className,
}: EmptyStateProps) => {
  const ink = tone === 'error' ? 'var(--rose)' : 'var(--fg-1)';

  return (
    <div
      className={cn('col', className)}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      {icon != null && (
        <span
          aria-hidden
          className="row"
          style={{
            color: tone === 'error' ? 'var(--rose)' : 'var(--fg-3)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {icon}
        </span>
      )}
      <div className="text-sm" style={{ fontWeight: 600, color: ink }}>
        {title}
      </div>
      {hint != null && (
        <p className="text-xs" style={{ margin: 0, color: 'var(--fg-3)', maxWidth: '44ch', lineHeight: 1.55 }}>
          {hint}
        </p>
      )}
      {action != null && (
        <div className="row gap-2" style={{ marginTop: 'var(--space-3)' }}>
          {action}
        </div>
      )}
    </div>
  );
};

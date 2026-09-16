import { cn } from '@/lib/utils';

/**
 * The one page container.
 *
 * Width is a named intent rather than a number. The app previously carried
 * nine competing per-page max-widths between 560px and 2240px — two of them
 * above the shell's own cap and therefore silently clamped — because every
 * page picked its own. Three widths cover every real case:
 *
 *   prose    long-form documentation, held near 72ch for readability
 *   default  lists, boards and detail views
 *   wide     tables and anything that genuinely wants the monitor
 *
 * Horizontal padding matches the shell's own so the acting-agent row and the
 * page body line up at every breakpoint.
 */
type PageWidth = 'prose' | 'default' | 'wide';

const widths: Record<PageWidth, string> = {
  prose: 'max-w-[68rem]',
  default: 'max-w-[var(--content-max)]',
  wide: 'max-w-none',
};

interface PageFrameProps {
  children: React.ReactNode;
  width?: PageWidth;
  className?: string;
  /**
   * Escape hatch for a page that genuinely needs a specific pixel cap.
   * Prefer `width`; this exists so the remaining one-offs can be migrated
   * without being redesigned in the same commit.
   */
  maxW?: number;
}

export const PageFrame = ({ children, width = 'default', className, maxW }: PageFrameProps) => (
  <div className={cn('flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8', className)}>
    <div
      className={cn('mx-auto w-full', maxW ? undefined : widths[width])}
      style={maxW ? { maxWidth: maxW } : undefined}
    >
      {children}
    </div>
  </div>
);

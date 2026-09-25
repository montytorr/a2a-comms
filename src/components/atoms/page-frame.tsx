import { cn } from '@/lib/utils';

/**
 * The one page container.
 *
 * The page canvas fills the dashboard. Individual reading and form surfaces
 * can set their own comfortable line length inside that canvas.
 *
 * Horizontal padding matches the shell's own so the acting-agent row and the
 * page body line up at every breakpoint.
 */
type PageWidth = 'narrow' | 'prose' | 'default' | 'wide';

/* These were all `max-w-none`, on the reasoning that "individual reading and
   form surfaces can set their own comfortable line length inside that
   canvas". The data pages do. The reading and form pages never did, so
   `prose` and `narrow` were inert on twelve call sites and api-docs and
   security rendered body text at ~1300px lines on a 1600px window — roughly
   double a readable measure.

   `default` and `wide` still fill the canvas: a table or a board wants the
   room. `prose` and `narrow` do what they say again. */
const widths: Record<PageWidth, string> = {
  narrow: 'max-w-[42rem]',
  prose: 'max-w-[68rem]',
  default: 'max-w-none',
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

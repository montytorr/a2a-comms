import type { CSSProperties, ReactNode } from 'react';
import {
  dotClassForTone,
  pillClassForTone,
  statusLabel,
  statusTone,
  tonePulses,
  type StatusDomain,
  type Tone,
} from '@/lib/status-tone';

export type StatusBadgeSize = 'sm' | 'md' | 'lg';

/** `.pill` is 22px in CSS (`lg`). The call sites that overrode it wanted 16,
 *  17 or 18; 17 was a rounding of 18, so two smaller steps cover all of them. */
const SIZE_HEIGHT: Record<StatusBadgeSize, number | undefined> = {
  sm: 16,
  md: 18,
  lg: undefined, // the stylesheet's own height
};

/** The dot shrinks with the chip so it stays a marker and not a bullet. */
const SIZE_DOT: Record<StatusBadgeSize, number> = { sm: 4, md: 4, lg: 6 };

export interface StatusBadgeProps {
  status: string | null | undefined;
  /** Which status union `status` belongs to. Defaults to contract, which is
   *  what the three original call sites meant. */
  domain?: StatusDomain;
  /** Overrides the lookup. For states that are not themselves a status —
   *  a stale run, an overdue due date — not for second-guessing the map. */
  tone?: Tone;
  label?: ReactNode;
  dot?: 'auto' | 'static' | 'pulse' | 'none';
  size?: StatusBadgeSize;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children?: ReactNode;
}

/**
 * The one status chip.
 *
 * It replaced seven renderers that each re-derived a colour from a status, so
 * the variations they had between them are props here rather than reasons to
 * write new markup:
 *
 *   `domain`  which entity's status this is — picks the map in status-tone.ts
 *   `dot`     the marker: absent, still, pulsing, or `auto` (pulses on amber)
 *   `size`    one of three heights, replacing the ad-hoc 16/17/18/22 overrides
 *   `tone`    an explicit override, for the few states that are not a status
 *             lookup (a stale run, an overdue date)
 *   `label`   display text, when the raw status is not what to show
 *   children  trailing content, e.g. a dropdown chevron
 *
 * Colour never appears in this file. It comes from status-tone.ts, which is
 * exhaustive over the unions in types.ts.
 */

export default function StatusBadge({
  status,
  domain = 'contract',
  tone: toneOverride,
  label,
  dot = 'auto',
  size = 'md',
  className = '',
  style,
  title,
  children,
}: StatusBadgeProps) {
  const tone = toneOverride ?? statusTone(domain, status);
  const height = SIZE_HEIGHT[size];
  const dotSize = SIZE_DOT[size];
  const pulse = dot === 'pulse' || (dot === 'auto' && tonePulses(tone));

  return (
    <span
      className={`${pillClassForTone(tone)}${className ? ` ${className}` : ''}`}
      style={height === undefined ? style : { height, ...style }}
      title={title}
    >
      {dot !== 'none' && (
        <span
          className={`${dotClassForTone(tone)}${pulse ? ' pulse' : ''}`}
          style={{ width: dotSize, height: dotSize }}
        />
      )}
      {label ?? statusLabel(status)}
      {children}
    </span>
  );
}

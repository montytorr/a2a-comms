export type AvatarTone = 'amber' | 'mint' | 'peri' | 'rose';

interface AvatarProps {
  name: string;
  tone?: AvatarTone;
  size?: number;
}

export const toneColors: Record<AvatarTone, [string, string]> = {
  amber: ['var(--amber)', 'var(--on-amber)'],
  mint:  ['var(--mint)', 'var(--on-mint)'],
  peri:  ['var(--peri)', 'var(--on-peri)'],
  rose:  ['var(--rose)', 'var(--on-rose)'],
};

export const avatarTones: AvatarTone[] = ['amber', 'mint', 'peri', 'rose'];

export function hashString(value: string): number {
  const normalized = value.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  return hash >>> 0;
}

export function toneForName(name: string): AvatarTone {
  return avatarTones[hashString(name || '?') % avatarTones.length];
}

/**
 * A pill coloured by a hash of a name — identity, not state.
 *
 * It draws from the SAME four classes the status palette uses, so anywhere it
 * appears beside a status chip the colour reads as a status and lies: a
 * participant called "Zed" came out mint (the "finished well" tone) whether
 * the participant had accepted or been rejected. Both call sites it had —
 * contract participants and the "You" chip on /users — sat next to status
 * chips, and both now use a tone that means something.
 *
 * Kept because per-name colour is a real idea, but it needs a visual language
 * of its own before it is used again. `Avatar` is that language today: it
 * paints the tone as a solid glyph, which no status chip ever does, so it can
 * never be mistaken for one. Prefer an `Avatar`; if you need a chip, give it a
 * tone from `@/lib/status-tone` and let the Avatar inside carry the identity.
 */
export function pillClassForName(name: string) {
  return `pill pill--${toneForName(name)}`;
}

export const Avatar = ({ name, tone, size = 28 }: AvatarProps) => {
  const resolvedTone = tone || toneForName(name);
  const [bg, fg] = toneColors[resolvedTone] || toneColors.amber;
  const initial = ((name || '?').trim() || '?').slice(0, 1).toUpperCase();

  return (
    <span style={{
      width: size,
      height: size,
      borderRadius: 'var(--radius-2)',
      background: bg,
      color: fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      fontWeight: 600,
      // Proportional to the `size` prop, so it cannot be a fixed step from the
      // type scale. The avatar is a glyph, not prose, and has no breakpoint
      // behaviour to lose — the one case the ratchet cannot express.
      // eslint-disable-next-line no-restricted-syntax
      fontSize: size * 0.42,
      flexShrink: 0,
    }}>
      {initial}
    </span>
  );
};

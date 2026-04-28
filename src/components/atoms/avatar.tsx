export type AvatarTone = 'amber' | 'mint' | 'peri' | 'rose';

interface AvatarProps {
  name: string;
  tone?: AvatarTone;
  size?: number;
}

export const toneColors: Record<AvatarTone, [string, string]> = {
  amber: ['oklch(0.78 0.16 65)', 'oklch(0.18 0.05 65)'],
  mint:  ['oklch(0.78 0.14 165)', 'oklch(0.18 0.04 165)'],
  peri:  ['oklch(0.72 0.10 265)', 'oklch(0.18 0.04 265)'],
  rose:  ['oklch(0.74 0.14 25)', 'oklch(0.18 0.05 25)'],
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

export function pillClassForName(name: string) {
  return `pill pill--${toneForName(name)}`;
}

export const Avatar = ({ name, tone, size = 28 }: AvatarProps) => {
  const resolvedTone = tone || toneForName(name);
  const [bg, fg] = toneColors[resolvedTone] || toneColors.amber;
  const initial = (name || '?').slice(0, 1).toUpperCase();

  return (
    <span style={{
      width: size,
      height: size,
      borderRadius: 6,
      background: bg,
      color: fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--mono)',
      fontWeight: 600,
      fontSize: size * 0.42,
      flexShrink: 0,
    }}>
      {initial}
    </span>
  );
};

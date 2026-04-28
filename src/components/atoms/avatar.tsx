type AvatarTone = 'amber' | 'mint' | 'peri' | 'rose';

interface AvatarProps {
  name: string;
  tone?: AvatarTone;
  size?: number;
}

const toneColors: Record<AvatarTone, [string, string]> = {
  amber: ['oklch(0.78 0.16 65)', 'oklch(0.18 0.05 65)'],
  mint:  ['oklch(0.78 0.14 165)', 'oklch(0.18 0.04 165)'],
  peri:  ['oklch(0.72 0.10 265)', 'oklch(0.18 0.04 265)'],
  rose:  ['oklch(0.74 0.14 25)', 'oklch(0.18 0.05 25)'],
};

export const Avatar = ({ name, tone = 'amber', size = 28 }: AvatarProps) => {
  const [bg, fg] = toneColors[tone] || toneColors.amber;
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

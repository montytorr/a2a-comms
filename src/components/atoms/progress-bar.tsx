interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}

export const ProgressBar = ({ value, max = 100, color = 'var(--mint)', height = 4 }: ProgressBarProps) => {
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div style={{
      height,
      background: 'var(--bg-3)',
      borderRadius: 999,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        width: `${pct}%`,
        background: `linear-gradient(90deg, transparent, ${color})`,
        boxShadow: `0 0 8px ${color}`,
      }} />
    </div>
  );
};

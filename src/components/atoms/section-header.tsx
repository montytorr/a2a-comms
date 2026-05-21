interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}

export const SectionHeader = ({ eyebrow, title, sub, right }: SectionHeaderProps) => (
  <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
    <div className="col gap-1">
      {eyebrow && <div className="upper">{eyebrow}</div>}
      <div className="h1">{title}</div>
      {sub && <div className="muted" style={{ fontSize: 13 }}>{sub}</div>}
    </div>
    {right != null && <div className="row gap-2">{right}</div>}
  </div>
);

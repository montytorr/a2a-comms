interface KVProps {
  label: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

export const KV = ({ label, children, align = 'left' }: KVProps) => (
  <div className="col" style={{ gap: 4, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
    <div className="upper">{label}</div>
    <div style={{ color: 'var(--fg-1)', fontSize: 13 }}>{children}</div>
  </div>
);

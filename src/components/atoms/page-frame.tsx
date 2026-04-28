interface PageFrameProps {
  children: React.ReactNode;
  maxW?: number;
}

export const PageFrame = ({ children, maxW = 1240 }: PageFrameProps) => (
  <div className="scroll" style={{ flex: 1, padding: '28px 32px 60px', minHeight: 0 }}>
    <div style={{ maxWidth: maxW, margin: '0 auto' }}>
      {children}
    </div>
  </div>
);

// The Holloway mark, drawn from public/holloway-icon.svg: a teal hill on a
// night tile, with a sunken lane worn through it. Kept inline so it renders
// before any asset loads and scales cleanly at every size.
export const HollowayMark = ({ size = 28, label = 'Holloway' }: { size?: number; label?: string }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={label} style={{ display: 'block', flexShrink: 0 }}>
    <rect width="32" height="32" rx="7" fill="#0b1220" />
    <path d="M4.5 27 L4.5 12.5 Q16 2.5 27.5 12.5 L27.5 27 Z" fill="#2dd4bf" stroke="#2dd4bf" strokeWidth="1" strokeLinejoin="round" />
    <path d="M10 27.5 C12 21 17.6 17.5 15.1 7 L16.9 7 C20.6 17.5 21 21.5 22 27.5 Z" fill="#0b1220" />
  </svg>
);

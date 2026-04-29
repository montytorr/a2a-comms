'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export default function ContractRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/contracts/${id}`}
      aria-label="Open contract detail"
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      style={{
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
    </Link>
  );
}

'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

function ContractRowStatus() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span role="status" aria-live="polite" className="contract-row-loading">
      <span aria-hidden="true" className="contract-row-loading__spinner" />
      Loading contract…
    </span>
  );
}

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
        position: 'relative',
        color: 'inherit',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      {children}
      <ContractRowStatus />
    </Link>
  );
}

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
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/contracts/${id}`}
      aria-label={`Open contract: ${title}`}
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

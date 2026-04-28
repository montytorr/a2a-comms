'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode, KeyboardEvent } from 'react';

export default function ContractRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const navigate = () => router.push(`/contracts/${id}`);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      style={{ cursor: 'pointer' }}
    >
      {children}
    </div>
  );
}

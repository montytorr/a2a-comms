'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export default function ContractRow({
  id,
  children,
}: {
  id: string;
  col?: Record<string, string>;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      className="group hover:bg-white/[0.02] transition-all duration-300 cursor-pointer"
      onClick={() => router.push(`/contracts/${id}`)}
    >
      {children}
    </tr>
  );
}

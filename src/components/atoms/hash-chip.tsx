'use client';

import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';

interface HashChipProps {
  value: string;
  full?: boolean;
  copyable?: boolean;
}

export const HashChip = ({ value, full = false, copyable = true }: HashChipProps) => {
  const [copied, setCopied] = useState(false);

  const display = useMemo(() => {
    if (full || !value) return value;
    const v = String(value);
    if (v.length <= 14) return v;
    return v.slice(0, 6) + '…' + v.slice(-4);
  }, [value, full]);

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <span className="hash-chip" onClick={copyable ? onCopy : undefined} title={value}>
      <span>{display}</span>
      {copyable && (copied ? <Check size={11} /> : <Copy size={11} />)}
    </span>
  );
};

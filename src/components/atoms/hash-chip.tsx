'use client';

import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';

interface HashChipProps {
  value: string;
  full?: boolean;
  copyable?: boolean;
}

/* Was a <span onClick> with no role, tabIndex or key handler, so the copy
   action was mouse-only; its glyph was opacity:0 until hover, so on a touch
   device the affordance was invisible as well as unreachable. And the chip
   advertised itself with cursor:pointer and a hover treatment on the two of
   three call sites that pass copyable={false}, where clicking does nothing.

   Copyable renders a real button; non-copyable renders inert text. */
export const HashChip = ({ value, full = false, copyable = true }: HashChipProps) => {
  const [copied, setCopied] = useState(false);

  const display = useMemo(() => {
    if (full || !value) return value;
    const v = String(value);
    if (v.length <= 14) return v;
    return v.slice(0, 6) + '…' + v.slice(-4);
  }, [value, full]);

  if (!copyable) {
    return <span className="hash-chip hash-chip--static" title={value}><span>{display}</span></span>;
  }

  const onCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };

  return (
    <button
      type="button"
      className="hash-chip"
      onClick={onCopy}
      title={value}
      aria-label={copied ? `Copied ${value}` : `Copy ${value}`}
    >
      <span>{display}</span>
      {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
    </button>
  );
};

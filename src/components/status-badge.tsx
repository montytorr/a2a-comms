import type { ContractStatus, ParticipantStatus, MessageType } from '@/lib/types';

const statusToneMap: Record<string, string> = {
  proposed: 'amber',
  active: 'amber',
  closed: 'ghost',
  rejected: 'rose',
  expired: 'rose',
  cancelled: 'ghost',
  pending: 'amber',
  accepted: 'mint',
  message: 'ghost',
  request: 'peri',
  response: 'mint',
  update: 'peri',
  status: 'peri',
};

interface StatusBadgeProps {
  status: string;
  variant?: 'contract' | 'participant' | 'message';
  className?: string;
}

export default function StatusBadge({ status, variant = 'contract', className = '' }: StatusBadgeProps) {
  const tone = statusToneMap[status] || 'ghost';
  const isActive = status === 'active' || status === 'accepted' || status === 'proposed' || status === 'pending';

  return (
    <span className={`pill pill--${tone} ${className}`} style={{ height: 18, fontSize: 9.5 }}>
      <span
        className={`dot dot--${tone} ${isActive ? 'pulse' : ''}`}
        style={{ width: 4, height: 4 }}
      />
      {status}
    </span>
  );
}

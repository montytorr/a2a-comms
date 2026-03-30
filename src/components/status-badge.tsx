import type { ContractStatus, ParticipantStatus, MessageType } from '@/lib/types';

const contractStatusConfig: Record<ContractStatus, { bg: string; text: string; dot: string; glow: string }> = {
  proposed: { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]' },
  active: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400', glow: 'shadow-[0_0_8px_rgba(6,182,212,0.2)]' },
  closed: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-500', dot: 'bg-gray-500', glow: '' },
  rejected: { bg: 'bg-red-500/[0.08]', text: 'text-red-400', dot: 'bg-red-400', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.15)]' },
  expired: { bg: 'bg-orange-500/[0.08]', text: 'text-orange-400', dot: 'bg-orange-400', glow: '' },
  cancelled: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-600', dot: 'bg-gray-600', glow: '' },
};

const participantStatusConfig: Record<ParticipantStatus, { bg: string; text: string; dot: string; glow: string }> = {
  pending: { bg: 'bg-amber-500/[0.08]', text: 'text-amber-400', dot: 'bg-amber-400', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.15)]' },
  accepted: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.15)]' },
  rejected: { bg: 'bg-red-500/[0.08]', text: 'text-red-400', dot: 'bg-red-400', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.15)]' },
};

const messageTypeConfig: Record<MessageType, { bg: string; text: string; dot: string; glow: string }> = {
  message: { bg: 'bg-gray-500/[0.06]', text: 'text-gray-400', dot: 'bg-gray-400', glow: '' },
  request: { bg: 'bg-blue-500/[0.08]', text: 'text-blue-400', dot: 'bg-blue-400', glow: 'shadow-[0_0_8px_rgba(59,130,246,0.15)]' },
  response: { bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-400', dot: 'bg-emerald-400', glow: 'shadow-[0_0_8px_rgba(16,185,129,0.15)]' },
  update: { bg: 'bg-cyan-500/[0.08]', text: 'text-cyan-400', dot: 'bg-cyan-400', glow: 'shadow-[0_0_8px_rgba(6,182,212,0.15)]' },
  status: { bg: 'bg-violet-500/[0.08]', text: 'text-violet-400', dot: 'bg-violet-400', glow: 'shadow-[0_0_8px_rgba(139,92,246,0.15)]' },
};

interface StatusBadgeProps {
  status: string;
  variant?: 'contract' | 'participant' | 'message';
  className?: string;
}

export default function StatusBadge({ status, variant = 'contract', className = '' }: StatusBadgeProps) {
  const defaultConfig = { bg: 'bg-gray-500/[0.06]', text: 'text-gray-400', dot: 'bg-gray-400', glow: '' };
  let config = defaultConfig;

  if (variant === 'contract') {
    config = contractStatusConfig[status as ContractStatus] || defaultConfig;
  } else if (variant === 'participant') {
    config = participantStatusConfig[status as ParticipantStatus] || defaultConfig;
  } else if (variant === 'message') {
    config = messageTypeConfig[status as MessageType] || defaultConfig;
  }

  const isActive = status === 'active' || status === 'accepted';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${config.bg} ${config.text} ${config.glow} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {isActive && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-30`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dot}`} />
      </span>
      {status}
    </span>
  );
}

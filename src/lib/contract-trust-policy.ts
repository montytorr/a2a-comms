import type { ApiError } from '@/lib/types';

export type ContractParticipantRole = 'proposer' | 'invitee' | 'observer';
export type ContractParticipantStatus = 'pending' | 'accepted' | 'rejected' | string;
export type ContractMutationAction = 'accept' | 'reject' | 'cancel' | 'send-message' | 'close' | 'upload-attachment';

export interface ContractParticipantPolicyInput {
  role: ContractParticipantRole;
  status?: ContractParticipantStatus | null;
}

export type ContractParticipantPolicyDecision =
  | { allowed: true; status: number }
  | { allowed: false; status: number; body: ApiError };

function forbid(error: string, code: ApiError['code'] = 'FORBIDDEN', status = 403): ContractParticipantPolicyDecision {
  return {
    allowed: false,
    status,
    body: { error, code },
  };
}

export function evaluateContractParticipantMutation(
  action: ContractMutationAction,
  participant: ContractParticipantPolicyInput
): ContractParticipantPolicyDecision {
  switch (action) {
    case 'accept':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract context but cannot accept contracts');
      }
      if (participant.role === 'proposer') {
        return forbid('Proposers cannot accept their own contracts');
      }
      if (participant.status !== 'pending') {
        return forbid(`Already responded: ${participant.status ?? 'unknown'}`, 'ALREADY_RESPONDED', 409);
      }
      return { allowed: true, status: 200 };

    case 'reject':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract context but cannot reject contracts');
      }
      if (participant.role === 'proposer') {
        return forbid('Proposers cannot reject their own contracts');
      }
      if (participant.status !== 'pending') {
        return forbid(`Already responded: ${participant.status ?? 'unknown'}`, 'ALREADY_RESPONDED', 409);
      }
      return { allowed: true, status: 200 };

    case 'cancel':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract context but cannot cancel contracts');
      }
      if (participant.role !== 'proposer') {
        return forbid('Only the proposer can cancel a contract');
      }
      return { allowed: true, status: 200 };

    case 'send-message':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract context but cannot send messages');
      }
      return { allowed: true, status: 200 };

    case 'close':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract context but cannot close contracts');
      }
      return { allowed: true, status: 200 };

    case 'upload-attachment':
      if (participant.role === 'observer') {
        return forbid('Observers may inspect contract artifacts but cannot upload new ones');
      }
      return { allowed: true, status: 200 };

    default:
      return { allowed: true, status: 200 };
  }
}

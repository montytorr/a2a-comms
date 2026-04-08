import type { ApiError } from '@/lib/types';
import type { ProjectAccessRecord } from '@/lib/project-access';
import { evaluateObserverProjectAttachmentDownloadPolicyAccess, evaluateObserverProjectReadPolicyAccess } from './agent-trust-policy';

export interface AttachmentAccessActor {
  trust_tier?: string | null;
}

export interface AttachmentScope {
  contract_id?: string | null;
}

export interface AttachmentDownloadDecision {
  allowed: boolean;
  status: number;
  body?: ApiError;
}

export function evaluateAttachmentDownloadAccess(
  actor: AttachmentAccessActor,
  projectAccess: ProjectAccessRecord | null,
  scope: AttachmentScope
): AttachmentDownloadDecision {
  if (!projectAccess) {
    return {
      allowed: false,
      status: 403,
      body: { error: 'Forbidden', code: 'FORBIDDEN' },
    };
  }

  if (projectAccess.accessKind !== 'observer') {
    return { allowed: true, status: 200 };
  }

  const hasContractBoundary = typeof scope.contract_id === 'string' && scope.contract_id.length > 0;

  const observerReadDecision = evaluateObserverProjectReadPolicyAccess(actor);
  if (!observerReadDecision.allowed) {
    return {
      allowed: false,
      status: observerReadDecision.status || 403,
      body: observerReadDecision.body,
    };
  }

  if (!hasContractBoundary) {
    const attachmentDecision = evaluateObserverProjectAttachmentDownloadPolicyAccess(actor);
    if (!attachmentDecision.allowed) {
      return {
        allowed: false,
        status: attachmentDecision.status || 403,
        body: attachmentDecision.body,
      };
    }
  }

  return { allowed: true, status: 200 };
}

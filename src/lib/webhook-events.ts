import type { WebhookEventType } from './types';

export const LEGACY_WEBHOOK_EVENT_ALIASES = ['contract_state'] as const;
export type LegacyWebhookEventAlias = (typeof LEGACY_WEBHOOK_EVENT_ALIASES)[number];

export const CANONICAL_WEBHOOK_EVENTS = [
  'invitation',
  'message',
  'contract.accepted',
  'contract.rejected',
  'contract.cancelled',
  'contract.closed',
  'contract.expired',
  'task.created',
  'task.updated',
  'task.blocker_stale',
  'sprint.created',
  'sprint.updated',
  'project.member_invited',
  'project.member_accepted',
  'project.member_declined',
  'project.member_cancelled',
  'project.member_expired',
  'approval.requested',
  'approval.approved',
  'approval.denied',
] as const satisfies readonly WebhookEventType[];

export const ACCEPTED_WEBHOOK_EVENTS = [
  ...CANONICAL_WEBHOOK_EVENTS,
  ...LEGACY_WEBHOOK_EVENT_ALIASES,
] as const;

export type AcceptedWebhookEvent = (typeof ACCEPTED_WEBHOOK_EVENTS)[number];

const acceptedWebhookEventSet = new Set<string>(ACCEPTED_WEBHOOK_EVENTS);

export function isAcceptedWebhookEvent(event: string): event is AcceptedWebhookEvent {
  return acceptedWebhookEventSet.has(event);
}

/**
 * Security event taxonomy for the audit log.
 *
 * All security-relevant events flow through this module so they share
 * a consistent shape and can be filtered in the dashboard.
 */

import { createServerClient } from './supabase/server';

// ── Event types ──

export type SecurityEventType =
  | 'auth.success'
  | 'auth.failure'
  | 'authz.denied'
  | 'webhook.delivery.success'
  | 'webhook.delivery.failure'
  | 'webhook.disabled'
  | 'suspicious.replay_detected'
  | 'suspicious.invalid_signature'
  | 'policy.kill_switch.activated'
  | 'policy.kill_switch.deactivated';

/** All security event types (used by dashboard filters). */
export const SECURITY_EVENT_TYPES: SecurityEventType[] = [
  'auth.success',
  'auth.failure',
  'authz.denied',
  'webhook.delivery.success',
  'webhook.delivery.failure',
  'webhook.disabled',
  'suspicious.replay_detected',
  'suspicious.invalid_signature',
  'policy.kill_switch.activated',
  'policy.kill_switch.deactivated',
];

/** Returns true if the given action string is a security event. */
export function isSecurityEvent(action: string): boolean {
  return SECURITY_EVENT_TYPES.includes(action as SecurityEventType);
}

// ── Severity classification ──

export type Severity = 'info' | 'warning' | 'critical';

const SEVERITY_MAP: Record<SecurityEventType, Severity> = {
  'auth.success': 'info',
  'auth.failure': 'warning',
  'authz.denied': 'warning',
  'webhook.delivery.success': 'info',
  'webhook.delivery.failure': 'warning',
  'webhook.disabled': 'critical',
  'suspicious.replay_detected': 'critical',
  'suspicious.invalid_signature': 'critical',
  'policy.kill_switch.activated': 'critical',
  'policy.kill_switch.deactivated': 'info',
};

export function getSeverity(eventType: SecurityEventType): Severity {
  return SEVERITY_MAP[eventType] || 'info';
}

// ── Logging helper ──

interface SecurityEventParams {
  event: SecurityEventType;
  actor: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Log a security event to the audit log.
 * Adds `severity` and `security: true` to the details automatically.
 */
export async function logSecurityEvent(params: SecurityEventParams): Promise<void> {
  const severity = getSeverity(params.event);
  const supabase = createServerClient();

  await supabase.from('audit_log').insert({
    actor: params.actor,
    action: params.event,
    resource_type: params.resourceType || null,
    resource_id: params.resourceId || null,
    details: {
      ...params.details,
      severity,
      security: true,
    },
    ip_address: params.ipAddress || null,
  });
}

// ── Convenience functions ──

export async function logAuthSuccess(keyId: string, agentName: string, ip?: string): Promise<void> {
  await logSecurityEvent({
    event: 'auth.success',
    actor: agentName,
    resourceType: 'service_key',
    resourceId: keyId,
    details: { key_id: keyId },
    ipAddress: ip,
  });
}

export async function logAuthFailure(keyId: string | undefined, reason: string, code: string, ip?: string): Promise<void> {
  await logSecurityEvent({
    event: 'auth.failure',
    actor: keyId || 'unknown',
    details: { reason, code, key_id: keyId },
    ipAddress: ip,
  });
}

export async function logAuthzDenied(agentName: string, resource: string, resourceId: string, ip?: string): Promise<void> {
  await logSecurityEvent({
    event: 'authz.denied',
    actor: agentName,
    resourceType: resource,
    resourceId,
    details: { reason: 'Ownership or admin check failed' },
    ipAddress: ip,
  });
}

export async function logWebhookDelivery(
  status: 'success' | 'failure',
  webhookId: string,
  agentId: string,
  url: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await logSecurityEvent({
    event: status === 'success' ? 'webhook.delivery.success' : 'webhook.delivery.failure',
    actor: 'system',
    resourceType: 'webhook',
    resourceId: webhookId,
    details: { agent_id: agentId, url, ...details },
  });
}

export async function logWebhookDisabled(webhookId: string, agentId: string, url: string, failureCount: number): Promise<void> {
  await logSecurityEvent({
    event: 'webhook.disabled',
    actor: 'system',
    resourceType: 'webhook',
    resourceId: webhookId,
    details: { agent_id: agentId, url, failure_count: failureCount, reason: 'Auto-disabled after consecutive failures' },
  });
}

export async function logReplayDetected(nonce: string, keyId: string | undefined, ip?: string): Promise<void> {
  await logSecurityEvent({
    event: 'suspicious.replay_detected',
    actor: keyId || 'unknown',
    details: { nonce, key_id: keyId },
    ipAddress: ip,
  });
}

export async function logInvalidSignature(keyId: string | undefined, ip?: string): Promise<void> {
  await logSecurityEvent({
    event: 'suspicious.invalid_signature',
    actor: keyId || 'unknown',
    details: { key_id: keyId },
    ipAddress: ip,
  });
}

export async function logKillSwitchChange(activated: boolean, actor: string): Promise<void> {
  await logSecurityEvent({
    event: activated ? 'policy.kill_switch.activated' : 'policy.kill_switch.deactivated',
    actor,
    resourceType: 'system',
    details: { action: activated ? 'activated' : 'deactivated' },
  });
}

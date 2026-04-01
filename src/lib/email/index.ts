import { Resend } from 'resend';
import { createElement } from 'react';

import WelcomeEmail, { subject as welcomeSubject } from './templates/welcome';
import PasswordResetEmail, { subject as passwordResetSubject } from './templates/password-reset';
import ContractInvitationEmail, { subject as contractInvitationSubject } from './templates/contract-invitation';
import TaskAssignedEmail, { subject as taskAssignedSubject } from './templates/task-assigned';
import ApprovalRequestEmail, { subject as approvalRequestSubject } from './templates/approval-request';

const FROM = process.env.RESEND_FROM || 'A2A Comms <noreply@a2a.playground.montytorr.tech>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.tech';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(apiKey);
}

export interface SendEmailResult {
  id?: string;
  error?: string;
}

const TEMPLATE_NAMES = ['welcome', 'password-reset', 'contract-invitation', 'task-assigned', 'approval-request'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export function getTemplateNames(): string[] {
  return [...TEMPLATE_NAMES];
}

/**
 * Map template name to notification_preferences column name.
 * Returns null for templates that don't have a preference toggle.
 */
function templateToPreferenceColumn(template: string): string | null {
  const map: Record<string, string> = {
    'welcome': 'welcome',
    'contract-invitation': 'contract_invitation',
    'task-assigned': 'task_assigned',
    'approval-request': 'approval_request',
  };
  return map[template] ?? null;
}

/**
 * Check if an email should be sent based on user notification preferences.
 * Returns true if:
 * - No userId provided (backward compat)
 * - No preference row exists (default: send all)
 * - Template is 'password-reset' (always sends — security)
 * - User hasn't opted out of this template
 */
export async function shouldSendEmail(userId: string, template: string): Promise<boolean> {
  // Password reset always sends regardless of preferences
  if (template === 'password-reset') return true;

  const column = templateToPreferenceColumn(template);
  if (!column) return true; // Unknown template preference — send by default

  try {
    // Dynamic import to avoid circular deps and keep this usable in edge contexts
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = createServerClient();

    const { data } = await supabase
      .from('notification_preferences')
      .select(column)
      .eq('user_id', userId)
      .single();

    // No row = default to sending
    if (!data) return true;

    return (data as unknown as Record<string, boolean>)[column] !== false;
  } catch {
    // On any error, default to sending
    return true;
  }
}

/**
 * Send email with preference check. Wraps sendEmail with opt-out logic.
 */
export async function sendEmailWithPrefs(
  to: string,
  userId: string,
  template: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any> = {}
): Promise<SendEmailResult> {
  const allowed = await shouldSendEmail(userId, template);
  if (!allowed) {
    return { id: undefined, error: undefined }; // Silently skip — user opted out
  }
  return sendEmail(to, template, props);
}

/**
 * Generic send — template name + props (all template props are optional, have defaults).
 */
export async function sendEmail(
  to: string,
  template: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any> = {}
): Promise<SendEmailResult> {
  try {
    const resend = getResendClient();
    let result: Awaited<ReturnType<typeof resend.emails.send>>;

    switch (template) {
      case 'welcome':
        result = await resend.emails.send({ from: FROM, to, subject: welcomeSubject, react: createElement(WelcomeEmail, props) });
        break;
      case 'password-reset':
        result = await resend.emails.send({ from: FROM, to, subject: passwordResetSubject, react: createElement(PasswordResetEmail, props) });
        break;
      case 'contract-invitation':
        result = await resend.emails.send({ from: FROM, to, subject: contractInvitationSubject, react: createElement(ContractInvitationEmail, props) });
        break;
      case 'task-assigned':
        result = await resend.emails.send({ from: FROM, to, subject: taskAssignedSubject, react: createElement(TaskAssignedEmail, props) });
        break;
      case 'approval-request':
        result = await resend.emails.send({ from: FROM, to, subject: approvalRequestSubject, react: createElement(ApprovalRequestEmail, props) });
        break;
      default:
        return { error: `Unknown template: ${template}` };
    }

    if (result.error) return { error: result.error.message };
    return { id: result.data?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function sendWelcomeEmail(to: string, name: string, userId?: string): Promise<SendEmailResult> {
  const props = { name, dashboardUrl: APP_URL };
  if (userId) return sendEmailWithPrefs(to, userId, 'welcome', props);
  return sendEmail(to, 'welcome', props);
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<SendEmailResult> {
  return sendEmail(to, 'password-reset', { resetLink });
}

export async function sendContractInvitationEmail(
  to: string,
  props: { contractTitle: string; proposerName: string; contractId: string },
  userId?: string
): Promise<SendEmailResult> {
  const emailProps = {
    ...props,
    acceptUrl: `${APP_URL}/contracts/${props.contractId}`,
  };
  if (userId) return sendEmailWithPrefs(to, userId, 'contract-invitation', emailProps);
  return sendEmail(to, 'contract-invitation', emailProps);
}

export async function sendTaskAssignedEmail(
  to: string,
  props: { taskTitle: string; projectName: string; priority: string; taskUrl: string },
  userId?: string
): Promise<SendEmailResult> {
  if (userId) return sendEmailWithPrefs(to, userId, 'task-assigned', props);
  return sendEmail(to, 'task-assigned', props);
}

export async function sendApprovalRequestEmail(
  to: string,
  props: { actionDescription: string; requestedBy: string; details?: string },
  userId?: string
): Promise<SendEmailResult> {
  const emailProps = {
    ...props,
    approvalUrl: `${APP_URL}/approvals`,
  };
  if (userId) return sendEmailWithPrefs(to, userId, 'approval-request', emailProps);
  return sendEmail(to, 'approval-request', emailProps);
}

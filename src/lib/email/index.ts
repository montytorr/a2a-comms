import { Resend } from 'resend';
import { createElement } from 'react';

import WelcomeEmail, { subject as welcomeSubject } from './templates/welcome';
import PasswordResetEmail, { subject as passwordResetSubject } from './templates/password-reset';
import ContractInvitationEmail, { subject as contractInvitationSubject } from './templates/contract-invitation';
import TaskAssignedEmail, { subject as taskAssignedSubject } from './templates/task-assigned';

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

const TEMPLATE_NAMES = ['welcome', 'password-reset', 'contract-invitation', 'task-assigned'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export function getTemplateNames(): string[] {
  return [...TEMPLATE_NAMES];
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
      default:
        return { error: `Unknown template: ${template}` };
    }

    if (result.error) return { error: result.error.message };
    return { id: result.data?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<SendEmailResult> {
  return sendEmail(to, 'welcome', { name, dashboardUrl: APP_URL });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<SendEmailResult> {
  return sendEmail(to, 'password-reset', { resetLink });
}

export async function sendContractInvitationEmail(
  to: string,
  props: { contractTitle: string; proposerName: string; contractId: string }
): Promise<SendEmailResult> {
  return sendEmail(to, 'contract-invitation', {
    ...props,
    acceptUrl: `${APP_URL}/contracts/${props.contractId}`,
  });
}

export async function sendTaskAssignedEmail(
  to: string,
  props: { taskTitle: string; projectName: string; priority: string; taskUrl: string }
): Promise<SendEmailResult> {
  return sendEmail(to, 'task-assigned', props);
}

import { Resend } from 'resend';
import { ReactElement } from 'react';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || 'A2A Comms <noreply@a2a.playground.montytorr.tech>';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

/**
 * Send a transactional email via Resend.
 * All emails use branded A2A Comms templates with dark theme.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ id?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set, skipping email send');
    return { error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      react: opts.react,
      replyTo: opts.replyTo,
    });

    if (error) {
      console.error('[email] Resend error:', error);
      return { error: error.message };
    }

    return { id: data?.id };
  } catch (err) {
    console.error('[email] Send failed:', err);
    return { error: err instanceof Error ? err.message : 'Unknown email error' };
  }
}

/**
 * Send a welcome email to a new user.
 */
export async function sendWelcomeEmail(to: string, displayName: string) {
  const { WelcomeEmail } = await import('@/emails/welcome');
  return sendEmail({
    to,
    subject: 'Welcome to A2A Comms',
    react: WelcomeEmail({ displayName }),
  });
}

/**
 * Send a password reset email.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const { ResetPasswordEmail } = await import('@/emails/reset-password');
  return sendEmail({
    to,
    subject: 'Reset your A2A Comms password',
    react: ResetPasswordEmail({ resetUrl }),
  });
}

/**
 * Send a platform invitation email.
 */
export async function sendInviteEmail(to: string, inviterName: string, inviteUrl: string) {
  const { InviteEmail } = await import('@/emails/invite');
  return sendEmail({
    to,
    subject: `${inviterName} invited you to A2A Comms`,
    react: InviteEmail({ inviterName, inviteUrl }),
  });
}

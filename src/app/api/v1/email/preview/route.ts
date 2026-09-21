import { NextRequest, NextResponse } from 'next/server';
import { createElement, type ComponentType } from 'react';
import { render } from '@react-email/components';
import { createServerClient } from '@/lib/db/server';
import { sessionUser } from '@/lib/auth/session';
import WelcomeEmail from '@/lib/email/templates/welcome';
import PasswordResetEmail from '@/lib/email/templates/password-reset';
import ContractInvitationEmail from '@/lib/email/templates/contract-invitation';
import TaskAssignedEmail from '@/lib/email/templates/task-assigned';
import ApprovalRequestEmail from '@/lib/email/templates/approval-request';
import ProjectMemberInvitationEmail from '@/lib/email/templates/project-member-invitation';
import StaleBlockerEmail from '@/lib/email/templates/stale-blocker';
import type { TemplateName } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getAppUrl(req: NextRequest): string {
  const origin = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (origin) return `${proto}://${origin}`;
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!envUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set and request origin could not be derived');
  return envUrl;
}

type PreviewTemplate = TemplateName;

function getPreviewPayloads(APP_URL: string): Record<PreviewTemplate, Record<string, string>> { return {
  welcome: {
    name: 'Preview operator',
    dashboardUrl: APP_URL,
  },
  'password-reset': {
    resetLink: `${APP_URL}/reset-password?token=preview-only`,
  },
  'contract-invitation': {
    contractTitle: 'Preview contract proposal',
    proposerName: 'Preview agent',
    contractId: 'preview-contract-id',
    acceptUrl: `${APP_URL}/contracts/preview-contract-id`,
  },
  'task-assigned': {
    taskTitle: 'Preview task assignment',
    projectName: 'Preview project',
    priority: 'high',
    taskUrl: `${APP_URL}/projects/preview-project/tasks/preview-task`,
  },
  'approval-request': {
    actionDescription: 'Preview approval request',
    requestedBy: 'Preview agent',
    approvalUrl: `${APP_URL}/approvals`,
    details: 'Preview-only copy for rendering the approval email layout.',
  },
  'project-member-invitation': {
    projectTitle: 'Preview project',
    inviterName: 'Preview inviter',
    invitationUrl: `${APP_URL}/projects/preview-project`,
  },
  'stale-blocker': {
    taskTitle: 'Preview blocked task',
    projectName: 'Preview project',
    blockerSummary: 'Preview blocker summary',
    escalationReason: 'Preview-only escalation reason for rendering the stale-blocker email layout.',
    actedBy: 'Preview automation',
    blockerOwner: 'Preview owner',
    nextAction: 'Preview next action.',
    followUpAt: '2026-04-28T16:00:00.000Z',
    taskUrl: `${APP_URL}/projects/preview-project/tasks/preview-task`,
  },
}; }

const templateComponents: Record<PreviewTemplate, ComponentType<Record<string, unknown>>> = {
  welcome: WelcomeEmail as unknown as ComponentType<Record<string, unknown>>,
  'password-reset': PasswordResetEmail as unknown as ComponentType<Record<string, unknown>>,
  'contract-invitation': ContractInvitationEmail as unknown as ComponentType<Record<string, unknown>>,
  'task-assigned': TaskAssignedEmail as unknown as ComponentType<Record<string, unknown>>,
  'approval-request': ApprovalRequestEmail as unknown as ComponentType<Record<string, unknown>>,
  'project-member-invitation': ProjectMemberInvitationEmail as unknown as ComponentType<Record<string, unknown>>,
  'stale-blocker': StaleBlockerEmail as unknown as ComponentType<Record<string, unknown>>,
};

function isPreviewTemplate(value: string | null): value is PreviewTemplate {
  return Boolean(value && value in templateComponents);
}

/**
 * GET /api/v1/email/preview?template=welcome
 * Super-admin-only template rendering. Uses explicit preview-only payloads;
 * these are not seeded app records, dashboard metrics, or backend state.
 */
export async function GET(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });

  const db = createServerClient();
  let profile: { is_super_admin?: boolean | null } | null;
  try {
    const { data, error } = await db
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();
    // PGRST116 is "no profile row", which is an answer: this user is not a
    // super-admin. Every other error means the question went unanswered, and a
    // connection failure throws out of the await entirely. Neither is a 403 —
    // telling a super-admin they lack a permission they hold sends them looking
    // for a grant instead of at the database that is down.
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    profile = data;
  } catch (error) {
    console.error('[email/preview] could not determine super-admin status', error);
    return NextResponse.json(
      { error: 'Email preview is unavailable: your permissions could not be verified. Retry shortly.', code: 'DB_ERROR' },
      { status: 503 },
    );
  }
  if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });

  const template = new URL(req.url).searchParams.get('template');
  if (!isPreviewTemplate(template)) {
    return NextResponse.json({ error: 'Unknown template', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  let APP_URL: string;
  try {
    APP_URL = getAppUrl(req);
  } catch (error) {
    // No Host header and no NEXT_PUBLIC_APP_URL: a deployment setting is missing,
    // not a bad request. Uncaught this was a bare 500 with an empty body, which
    // an operator cannot tell apart from a crashed process.
    console.error('[email/preview] could not derive app url', error);
    return NextResponse.json(
      { error: 'Email preview is unavailable: this server could not derive its own URL and NEXT_PUBLIC_APP_URL is not set.', code: 'SERVICE_MISCONFIGURED' },
      { status: 503 },
    );
  }

  const previewPayloads = getPreviewPayloads(APP_URL);
  const Component = templateComponents[template];
  let html: string;
  try {
    html = await render(createElement(Component, previewPayloads[template]));
  } catch (error) {
    // A template that fails to render is our bug, but it still has to say so:
    // the same empty 500 otherwise.
    console.error('[email/preview] template render failed', template, error);
    return NextResponse.json(
      { error: `Failed to render the "${template}" email template.`, code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

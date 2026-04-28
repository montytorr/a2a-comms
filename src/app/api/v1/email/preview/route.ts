import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createElement, type ComponentType } from 'react';
import { render } from '@react-email/components';
import { createServerClient } from '@/lib/supabase/server';
import WelcomeEmail from '@/lib/email/templates/welcome';
import PasswordResetEmail from '@/lib/email/templates/password-reset';
import ContractInvitationEmail from '@/lib/email/templates/contract-invitation';
import TaskAssignedEmail from '@/lib/email/templates/task-assigned';
import ApprovalRequestEmail from '@/lib/email/templates/approval-request';
import ProjectMemberInvitationEmail from '@/lib/email/templates/project-member-invitation';
import StaleBlockerEmail from '@/lib/email/templates/stale-blocker';
import type { TemplateName } from '@/lib/email';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.tech';

type PreviewTemplate = TemplateName;

const previewPayloads: Record<PreviewTemplate, Record<string, string>> = {
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
};

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
  const cookieStore = await cookies();
  const supabaseAuth = createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_super_admin) return new NextResponse('Forbidden', { status: 403 });

  const template = new URL(req.url).searchParams.get('template');
  if (!isPreviewTemplate(template)) {
    return new NextResponse('Unknown template', { status: 400 });
  }

  const Component = templateComponents[template];
  const html = await render(createElement(Component, previewPayloads[template]));

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSSRClient } from '@supabase/ssr';
import { createServerClient } from '@/lib/supabase/server';
import { createElement } from 'react';
import { render } from '@react-email/components';

export const dynamic = 'force-dynamic';

import WelcomeEmail from '@/lib/email/templates/welcome';
import PasswordResetEmail from '@/lib/email/templates/password-reset';
import ContractInvitationEmail from '@/lib/email/templates/contract-invitation';
import TaskAssignedEmail from '@/lib/email/templates/task-assigned';
import ApprovalRequestEmail from '@/lib/email/templates/approval-request';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://a2a.playground.montytorr.tech';

const sampleData: Record<string, Record<string, unknown>> = {
  welcome: { name: 'Alice', dashboardUrl: APP_URL },
  'password-reset': { resetLink: `${APP_URL}/reset-password?token=sample` },
  'contract-invitation': {
    contractTitle: 'Data Processing Agreement',
    proposerName: 'Agent Alpha',
    contractId: 'ctr_sample123',
    acceptUrl: `${APP_URL}/contracts/ctr_sample123`,
  },
  'task-assigned': {
    taskTitle: 'Implement OAuth flow',
    projectName: 'Platform v2',
    priority: 'high',
    taskUrl: `${APP_URL}/projects/proj_sample/tasks/task_sample`,
  },
  'approval-request': {
    actionDescription: 'Rotate API keys for production agent',
    requestedBy: 'Agent Alpha',
    approvalUrl: `${APP_URL}/approvals`,
    details: 'Current keys have been active for 90 days. Rotation recommended per security policy.',
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;

const templateComponents: Record<string, AnyComponent> = {
  welcome: WelcomeEmail,
  'password-reset': PasswordResetEmail,
  'contract-invitation': ContractInvitationEmail,
  'task-assigned': TaskAssignedEmail,
  'approval-request': ApprovalRequestEmail,
};

/**
 * GET /api/v1/email/preview?template=welcome
 * Returns rendered HTML — super admin only.
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
    .from('user_profiles').select('is_super_admin').eq('id', user.id).single();
  if (!profile?.is_super_admin) return new NextResponse('Forbidden', { status: 403 });

  const template = new URL(req.url).searchParams.get('template');
  if (!template || !templateComponents[template]) {
    return new NextResponse('Unknown template', { status: 400 });
  }

  const Component = templateComponents[template];
  const html = await render(createElement(Component, sampleData[template] || {}));

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

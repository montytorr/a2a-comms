'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { logKillSwitchChange } from '@/lib/security-events';
import { approveDashboardRequest, requestApproval, consumeApprovalByAction } from '@/lib/approvals';

export async function getKillSwitchStatus(): Promise<{
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
  pending_approval_id?: string;
}> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('system_config')
    .select('*')
    .eq('key', 'kill_switch')
    .single();

  // Check for pending approval
  const { data: pendingApproval } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('action', 'killswitch.activate')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      enabled: false,
      updated_at: null,
      updated_by: null,
      pending_approval_id: pendingApproval?.id,
    };
  }

  return {
    enabled: (data.value as Record<string, unknown>)?.active === true,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
    pending_approval_id: pendingApproval?.id,
  };
}

/**
 * Request approval to activate the kill switch.
 * The actual activation happens only after another super_admin approves.
 */
export async function requestKillSwitchActivation(): Promise<{ approvalId: string; autoApproved: boolean }> {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const { id } = await requestApproval({
    action: 'killswitch.activate',
    actor: user.displayName,
    details: {
      reason: 'Kill switch activation requested via dashboard',
      user_id: user.id,
      requested_via: 'dashboard',
    },
  });

  const approvalResult = await approveDashboardRequest(id, user.id, user.displayName);
  if (!approvalResult.success) {
    throw new Error(approvalResult.error || 'Failed to auto-approve kill switch activation');
  }

  return { approvalId: id, autoApproved: true };
}

/**
 * Execute kill switch activation (called after approval).
 * Can also be called directly for deactivation (less destructive).
 */
export async function executeKillSwitchActivation() {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const supabase = createServerClient();

  const { data: pendingApproval } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('action', 'killswitch.activate')
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendingApproval) {
    throw new Error('No approved kill switch activation request found.');
  }

  const now = new Date().toISOString();

  const { error: ksError } = await supabase
    .from('system_config')
    .upsert({
      key: 'kill_switch',
      value: { active: true, activated_at: now },
      updated_at: now,
      updated_by: user.displayName,
    });

  if (ksError) throw new Error(`Failed to activate kill switch: ${ksError.message}`);

  const approved = await consumeApprovalByAction('killswitch.activate', user.displayName);
  if (!approved) {
    throw new Error('Failed to consume approval after state change.');
  }

  const { error: closeError } = await supabase
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: 'System kill switch activated',
      closed_at: now,
      updated_at: now,
    })
    .eq('status', 'active');

  if (closeError) throw new Error(`Failed to close active contracts: ${closeError.message}`);

  const { error: cancelError } = await supabase
    .from('contracts')
    .update({
      status: 'cancelled',
      close_reason: 'System kill switch activated',
      closed_at: now,
      updated_at: now,
    })
    .eq('status', 'proposed');

  if (cancelError) throw new Error(`Failed to cancel proposed contracts: ${cancelError.message}`);

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'killswitch.activate',
    resource_type: 'system',
    details: { reason: 'Kill switch activated via UI (auto-approved admin action)', approval_id: approved.id },
  });

  // Security event
  logKillSwitchChange(true, user.displayName).catch(() => {});

}

export async function deactivateKillSwitch() {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: current } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'kill_switch')
    .single();

  if (!current?.value?.active) {
    throw new Error('Kill switch is already inactive');
  }

  const { error: updateError } = await supabase
    .from('system_config')
    .update({
      value: { active: false, deactivated_at: now },
      updated_at: now,
      updated_by: user.displayName,
    })
    .eq('key', 'kill_switch');

  if (updateError) {
    throw new Error('Failed to deactivate kill switch — please try again');
  }

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'killswitch.deactivate',
    resource_type: 'system',
    details: { reason: 'Kill switch deactivated via UI' },
  });

  // Security event
  logKillSwitchChange(false, user.displayName).catch(() => {});
}

'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';
import { logKillSwitchChange } from '@/lib/security-events';
import { requestApproval } from '@/lib/approvals';

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
export async function requestKillSwitchActivation(): Promise<{ approvalId: string }> {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const { id } = await requestApproval({
    action: 'killswitch.activate',
    actor: user.displayName,
    details: {
      reason: 'Kill switch activation requested via dashboard',
      user_id: user.id,
    },
  });

  return { approvalId: id };
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

  // Verify there's an approved request (or the user is executing their own approved request)
  const { data: approved } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('action', 'killswitch.activate')
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!approved) {
    throw new Error('No approved kill switch activation request found. Request approval first.');
  }

  const now = new Date().toISOString();

  // Update kill switch
  await supabase
    .from('system_config')
    .upsert({
      key: 'kill_switch',
      value: { active: true, activated_at: now },
      updated_at: now,
      updated_by: user.displayName,
    });

  // Close all active contracts
  await supabase
    .from('contracts')
    .update({
      status: 'closed',
      close_reason: 'System kill switch activated',
      closed_at: now,
      updated_at: now,
    })
    .eq('status', 'active');

  // Cancel all proposed contracts
  await supabase
    .from('contracts')
    .update({
      status: 'cancelled',
      close_reason: 'System kill switch activated',
      closed_at: now,
      updated_at: now,
    })
    .eq('status', 'proposed');

  // Audit log
  await supabase.from('audit_log').insert({
    actor: user.displayName,
    action: 'killswitch.activate',
    resource_type: 'system',
    details: { reason: 'Kill switch activated via UI (approved)', approval_id: approved.id },
  });

  // Security event
  logKillSwitchChange(true, user.displayName).catch(() => {});

  // Mark approval as consumed (update details)
  await supabase
    .from('pending_approvals')
    .update({
      details: { ...((approved.details as Record<string, unknown>) || {}), executed: true, executed_at: now },
    })
    .eq('id', approved.id);
}

export async function deactivateKillSwitch() {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Deactivate kill switch — no approval needed for deactivation
  await supabase
    .from('system_config')
    .upsert({
      key: 'kill_switch',
      value: { active: false, deactivated_at: now },
      updated_at: now,
      updated_by: user.displayName,
    });

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

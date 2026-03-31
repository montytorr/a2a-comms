'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth-context';

export async function getKillSwitchStatus(): Promise<{
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
}> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('system_config')
    .select('*')
    .eq('key', 'kill_switch')
    .single();

  if (!data) {
    return { enabled: false, updated_at: null, updated_by: null };
  }

  return {
    enabled: (data.value as Record<string, unknown>)?.active === true,
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  };
}

export async function activateKillSwitch() {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const supabase = createServerClient();
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
    details: { reason: 'Kill switch activated via UI' },
  });
}

export async function deactivateKillSwitch() {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Deactivate kill switch
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
}

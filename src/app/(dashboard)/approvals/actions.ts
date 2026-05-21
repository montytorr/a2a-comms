'use server';

import { getAuthUser } from '@/lib/auth-context';
import { approveDashboardRequest, denyDashboardRequest } from '@/lib/approvals';
import { revalidatePath } from 'next/cache';

export async function handleApprove(approvalId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const { createServerClient } = await import('@/lib/supabase/server');
  const supabase = createServerClient();
  const { data: approval } = await supabase
    .from('pending_approvals')
    .select('actor, details')
    .eq('id', approvalId)
    .single();

  if (approval) {
    const details = (approval.details || {}) as Record<string, unknown>;
    if (approval.actor === user.displayName || details.user_id === user.id) {
      throw new Error('You cannot approve your own request');
    }
  }

  const result = await approveDashboardRequest(approvalId, user.id, user.displayName);
  if (!result.success) throw new Error(result.error);

  revalidatePath('/approvals');
  return result;
}

export async function handleDeny(approvalId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const result = await denyDashboardRequest(approvalId, user.id, user.displayName);
  if (!result.success) throw new Error(result.error);

  revalidatePath('/approvals');
  return result;
}

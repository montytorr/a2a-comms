'use server';

import { getAuthUser } from '@/lib/auth-context';
import { approveRequest, denyRequest } from '@/lib/approvals';
import { revalidatePath } from 'next/cache';

export async function handleApprove(approvalId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const result = await approveRequest(approvalId, user.id, user.displayName);
  if (!result.success) throw new Error(result.error);

  revalidatePath('/approvals');
  return result;
}

export async function handleDeny(approvalId: string) {
  const user = await getAuthUser();
  if (!user) throw new Error('Not authenticated');
  if (!user.isSuperAdmin) throw new Error('Admin access required');

  const result = await denyRequest(approvalId, user.id, user.displayName);
  if (!result.success) throw new Error(result.error);

  revalidatePath('/approvals');
  return result;
}

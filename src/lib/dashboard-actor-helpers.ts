import type { AuthActorContext } from '@/lib/auth-actor-context';
import type { AuthUser } from '@/lib/auth-context';
import { getProjectAccess } from '@/lib/project-access';

export const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

export type DashboardActorContext = {
  user: AuthUser;
  actingAgentId: string | null;
  agentScope: string[];
};

export function toDashboardActorContext(auth: AuthActorContext): DashboardActorContext {
  return {
    user: auth.user,
    actingAgentId: auth.actingAgentId,
    agentScope: auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID],
  };
}

export async function resolveProjectActorAccess(
  auth: AuthActorContext,
  projectId: string,
  options?: { requireRole?: string; allowObserverCommentary?: boolean }
) {
  const user = auth.user;

  if (user.isSuperAdmin) {
    return {
      ...user,
      memberAgentId: auth.actingAgentId ?? null,
      projectRole: 'owner',
      accessKind: 'membership' as const,
    };
  }

  const scopedAgentIds = auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID];
  let access = null;
  for (const agentId of scopedAgentIds) {
    access = await getProjectAccess(projectId, agentId);
    if (access) break;
  }

  if (!access) throw new Error('Forbidden');
  if (options?.requireRole && access.role !== options.requireRole) throw new Error('Forbidden');
  if (access.accessKind === 'observer' && !options?.allowObserverCommentary) throw new Error('Forbidden');

  return {
    ...user,
    memberAgentId: access.agentId,
    projectRole: access.role,
    accessKind: access.accessKind,
  };
}

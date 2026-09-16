/**
 * Linking a contract to a project task.
 *
 * The link lives in `task_contracts`, and a contract reaches a *project* only
 * through it: contract -> task -> project. Everything that needs a contract's
 * project (attachment storage, most obviously) walks that hop.
 *
 * The rules are gathered here rather than written out at each call site so the
 * link-at-creation path and the link-after-the-fact path cannot drift apart.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getProjectAccess } from '@/lib/project-access';
import type { ApiError } from '@/lib/types';

export interface LinkTarget {
  projectId: string;
  taskId: string;
}

export interface LinkRefusal {
  status: number;
  body: ApiError;
}

/** The task a contract is linked to, plus the project that task belongs to. */
export interface LinkedTaskSummary {
  task_id: string;
  task_title: string | null;
  task_status: string | null;
  project_id: string;
  project_title: string | null;
}

function refuse(status: number, error: string, code: ApiError['code']): LinkRefusal {
  return { status, body: { error, code } satisfies ApiError };
}

/** An embed comes back as an object or a one-element array; normalise both. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface RawTaskEmbed {
  id?: string;
  title?: string | null;
  status?: string | null;
  project_id?: string | null;
  project?: { id?: string; title?: string | null } | Array<{ id?: string; title?: string | null }> | null;
}

/**
 * Turn a `task_contracts` row's task embed into a summary, or null when the row
 * cannot identify a project — which is the only thing that makes a link useful.
 */
export function normalizeLinkedTaskRow(
  taskEmbed: RawTaskEmbed | RawTaskEmbed[] | null | undefined
): LinkedTaskSummary | null {
  const task = one(taskEmbed);
  if (!task?.project_id || !task.id) return null;
  const project = one(task.project);
  return {
    task_id: task.id,
    task_title: task.title ?? null,
    task_status: task.status ?? null,
    project_id: task.project_id,
    project_title: project?.title ?? null,
  };
}

/**
 * `project_id` and `task_id` are meaningless alone. Returns an error message
 * when exactly one was supplied.
 */
export function validateLinkFields(projectId?: string, taskId?: string): string | null {
  if (Boolean(projectId) === Boolean(taskId)) return null;
  return 'project_id and task_id must be provided together to link a contract to a task';
}

/**
 * Can this agent attach a contract to this task?
 *
 * Checked before the contract is created on the link-at-creation path, so a
 * rejected link never leaves an orphaned contract behind.
 */
export async function checkLinkPermission(
  target: LinkTarget,
  agentId: string
): Promise<LinkRefusal | null> {
  const access = await getProjectAccess(target.projectId, agentId);
  if (!access) {
    return refuse(403, 'Not a participant in this project', 'FORBIDDEN');
  }
  if (access.accessKind === 'observer') {
    return refuse(
      403,
      'Observers may inspect linked contracts but cannot change task-contract links',
      'FORBIDDEN'
    );
  }

  const supabase = createServerClient();
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', target.taskId)
    .eq('project_id', target.projectId)
    .maybeSingle();

  if (!task) {
    return refuse(404, 'Task not found in this project', 'NOT_FOUND');
  }

  return null;
}

/**
 * Insert the link row. Treats an existing identical link as success: the caller
 * asked for the contract to be linked to the task, and it is.
 */
export async function linkContractToTask(
  contractId: string,
  taskId: string
): Promise<LinkRefusal | null> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('task_contracts')
    .insert({ task_id: taskId, contract_id: contractId });

  if (error) {
    if (error.code === '23505') return null; // already linked — the desired state
    return refuse(500, 'Failed to link contract', 'DB_ERROR');
  }
  return null;
}

/**
 * The contract's linked task and project, or null when it is not linked.
 *
 * A contract can in principle be linked to more than one task; this returns the
 * earliest, which is the one the attachment path already treats as canonical.
 */
export async function getLinkedTask(contractId: string): Promise<LinkedTaskSummary | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('task_contracts')
    .select(
      'task:tasks!task_contracts_task_id_fkey(id, title, status, project_id, project:projects(id, title))'
    )
    .eq('contract_id', contractId)
    .limit(1)
    .maybeSingle();

  return normalizeLinkedTaskRow(data?.task);
}

/**
 * Linked tasks for many contracts at once, keyed by contract id.
 *
 * One query for a whole list, rather than one per row.
 */
export async function getLinkedTasksForContracts(
  contractIds: string[]
): Promise<Map<string, LinkedTaskSummary>> {
  const out = new Map<string, LinkedTaskSummary>();
  if (contractIds.length === 0) return out;

  const supabase = createServerClient();
  const { data } = await supabase
    .from('task_contracts')
    .select(
      'contract_id, task:tasks!task_contracts_task_id_fkey(id, title, status, project_id, project:projects(id, title))'
    )
    .in('contract_id', contractIds);

  for (const row of data || []) {
    // A contract can be linked to more than one task; keep the first, matching
    // getLinkedTask and the attachment path.
    if (out.has(row.contract_id)) continue;
    const summary = normalizeLinkedTaskRow(row.task);
    if (summary) out.set(row.contract_id, summary);
  }

  return out;
}

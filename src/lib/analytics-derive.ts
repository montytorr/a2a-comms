/**
 * Pure reductions behind the analytics page.
 *
 * These live here rather than inline in the page component so they can be
 * tested: the page itself needs a database and a session, which makes the
 * arithmetic that actually decides what an operator sees the one part nobody
 * can check cheaply.
 */

export interface ContractRow {
  id: string;
  status: string;
  created_at: string;
  current_turns: number | null;
}

export interface TaskRow {
  id: string;
  status: string;
  project_id: string | null;
}

export interface ContractWindowStats {
  /** Count per status, for the donut. */
  byStatus: Record<string, number>;
  /** Count per YYYY-MM-DD, for the per-day bars. */
  perDay: Record<string, number>;
  /** Mean turns over contracts that have actually started. */
  avgTurns: number;
  total: number;
}

export function deriveContractStats(rows: ContractRow[]): ContractWindowStats {
  const byStatus: Record<string, number> = {};
  const perDay: Record<string, number> = {};
  let turnsTotal = 0;
  let turnsCount = 0;

  for (const c of rows) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const day = c.created_at.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
    // Proposed contracts have not taken a turn yet, so including them would
    // drag the mean toward zero and make it a measure of how many proposals
    // are outstanding rather than how long conversations run.
    if (c.status !== 'proposed') {
      turnsTotal += c.current_turns || 0;
      turnsCount++;
    }
  }

  return {
    byStatus,
    perDay,
    avgTurns: turnsCount > 0 ? Math.round((turnsTotal / turnsCount) * 10) / 10 : 0,
    total: rows.length,
  };
}

export interface TaskWindowStats {
  byStatus: Record<string, number>;
  doneCount: number;
  /** Projects touched in the window — the input to the active-project count. */
  projectIds: Set<string>;
}

export function deriveTaskStats(rows: TaskRow[]): TaskWindowStats {
  const byStatus: Record<string, number> = {};
  const projectIds = new Set<string>();
  let doneCount = 0;

  for (const t of rows) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    if (t.status === 'done') doneCount++;
    if (t.project_id) projectIds.add(t.project_id);
  }

  return { byStatus, doneCount, projectIds };
}

/**
 * Projects that are both currently active and were worked on in the window.
 *
 * `projects.updated_at` only moves when the project row itself is edited, so it
 * says nothing about whether anyone is working on the project — hence deriving
 * activity from its tasks instead.
 */
export function countActiveProjects(
  activeProjectIds: Set<string>,
  projectsWithActivity: Set<string>
): number {
  let n = 0;
  for (const id of projectsWithActivity) {
    if (activeProjectIds.has(id)) n++;
  }
  return n;
}

/** Fill a contiguous day axis, inserting zeroes for days with no rows. */
export function toDaySeries(perDay: Record<string, number>, dayLabels: string[]): number[] {
  return dayLabels.map((label) => perDay[label] || 0);
}

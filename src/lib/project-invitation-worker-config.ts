export const PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
export const PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE = 100;

export function getProjectInvitationSweepIntervalMs(env = process.env): number {
  return Number(env.PROJECT_INVITATION_SWEEP_INTERVAL_MS || PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS);
}

export function getProjectInvitationSweepBatchSize(env = process.env): number {
  return Number(env.PROJECT_INVITATION_SWEEP_BATCH_SIZE || PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE);
}

export function getProjectInvitationSweepRunMode(env = process.env): 'once' | 'daemon' {
  return env.PROJECT_INVITATION_SWEEP_ONCE === '1' ? 'once' : 'daemon';
}

export function getProjectInvitationSweepSummary(env = process.env): string {
  const intervalMs = getProjectInvitationSweepIntervalMs(env);
  const batchSize = getProjectInvitationSweepBatchSize(env);
  const mode = getProjectInvitationSweepRunMode(env);
  const minutes = intervalMs / 60000;
  const intervalLabel = Number.isInteger(minutes) ? `${minutes}m` : `${minutes.toFixed(2)}m`;
  return `mode=${mode}, interval=${intervalLabel}, batch=${batchSize}`;
}

export const PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
export const PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE = 100;

type SweepEnv = {
  PROJECT_INVITATION_SWEEP_INTERVAL_MS?: string;
  PROJECT_INVITATION_SWEEP_BATCH_SIZE?: string;
  PROJECT_INVITATION_SWEEP_ONCE?: string;
};

export function getProjectInvitationSweepIntervalMs(env: SweepEnv = process.env as SweepEnv): number {
  return Number(env.PROJECT_INVITATION_SWEEP_INTERVAL_MS || PROJECT_INVITATION_SWEEP_DEFAULT_INTERVAL_MS);
}

export function getProjectInvitationSweepBatchSize(env: SweepEnv = process.env as SweepEnv): number {
  return Number(env.PROJECT_INVITATION_SWEEP_BATCH_SIZE || PROJECT_INVITATION_SWEEP_DEFAULT_BATCH_SIZE);
}

export function getProjectInvitationSweepRunMode(env: SweepEnv = process.env as SweepEnv): 'once' | 'daemon' {
  return env.PROJECT_INVITATION_SWEEP_ONCE === '1' ? 'once' : 'daemon';
}

export function getProjectInvitationSweepSummary(env: SweepEnv = process.env as SweepEnv): string {
  const intervalMs = getProjectInvitationSweepIntervalMs(env);
  const batchSize = getProjectInvitationSweepBatchSize(env);
  const mode = getProjectInvitationSweepRunMode(env);
  const minutes = intervalMs / 60000;
  const intervalLabel = Number.isInteger(minutes) ? `${minutes}m` : `${minutes.toFixed(2)}m`;
  return `mode=${mode}, interval=${intervalLabel}, batch=${batchSize}`;
}

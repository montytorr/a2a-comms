import type { Task, TaskAttachment, TaskExecutionCheckpoint, TaskExecutionRun } from '@/lib/types';
import {
  formatExecutionTime,
  getExecutionSnapshotSummary,
  getExecutionStatusLabel,
  getExecutionStatusTone,
  getRecentExecutionCheckpoints,
  getRecentExecutionRuns,
  isExecutionStale,
} from '@/lib/task-execution-ui';
import { getDelegationProvenance } from '@/lib/delegated-execution';
import { getEscalationBrokerageProvenance } from '@/lib/escalation-brokerage';

function JsonPayload({ payload }: { payload: Record<string, unknown> | null | undefined }) {
  if (!payload || Object.keys(payload).length === 0) {
    return <span className="text-[11px] text-gray-500">No payload captured</span>;
  }

  return (
    <pre className="text-[11px] text-gray-300 bg-[#06060b]/80 border border-white/[0.03] rounded-xl p-4 overflow-x-auto font-mono leading-relaxed selection:bg-cyan-500/20 whitespace-pre-wrap break-words">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function formatAgentLabel(agent?: { id?: string; name?: string; display_name?: string } | null, fallbackId?: string | null) {
  if (agent?.display_name) return agent.display_name;
  if (agent?.name) return agent.name;
  return fallbackId || 'Unknown';
}

export default function ExecutionPanel({
  task,
  runs,
  checkpoints,
  attachments,
}: {
  task: Task;
  runs: TaskExecutionRun[];
  checkpoints: TaskExecutionCheckpoint[];
  attachments: TaskAttachment[];
}) {
  const stale = isExecutionStale(task.execution_status, task.execution_heartbeat_at);
  const statusTone = getExecutionStatusTone(task.execution_status, stale);
  const statusLabel = getExecutionStatusLabel(task.execution_status, stale);
  const recentRuns = getRecentExecutionRuns(runs);
  const recentCheckpoints = getRecentExecutionCheckpoints(checkpoints);
  const activeRun = task.active_run_id ? runs.find((run) => run.id === task.active_run_id) ?? null : null;

  return (
    <div className="rounded-2xl glass-card p-6 animate-fade-in" style={{ animationDelay: '0.08s' }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-[0.15em]">Execution</p>
          <p className="text-[12px] text-gray-400 mt-2">{getExecutionSnapshotSummary(task)}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase border ${statusTone}`}>
          {statusLabel}
        </span>
      </div>

      {stale && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3">
          <p className="text-[12px] font-semibold text-red-200">Heartbeat stale</p>
          <p className="text-[11px] text-red-100/80 mt-1">
            This task still shows as active, but the latest heartbeat is older than 15 minutes. Treat it as abandoned until a new heartbeat lands.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 text-[11px]">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Active run</p>
          <p className="text-gray-300 font-mono break-all">{task.active_run_id || 'None'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Latest checkpoint</p>
          <p className="text-gray-300">{task.last_checkpoint_summary || 'None recorded'}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Started</p>
          <p className="text-gray-300">{formatExecutionTime(task.execution_started_at)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Heartbeat</p>
          <p className="text-gray-300">{formatExecutionTime(task.execution_heartbeat_at)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 sm:col-span-2">
          <p className="text-gray-600 uppercase tracking-[0.12em] text-[9px] font-semibold mb-1">Completed</p>
          <p className="text-gray-300">{formatExecutionTime(task.execution_completed_at)}</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] font-medium text-cyan-300/90">Latest checkpoint payload</p>
            {task.last_checkpoint_at && <span className="text-[10px] text-gray-500">{formatExecutionTime(task.last_checkpoint_at)}</span>}
          </div>
          <JsonPayload payload={task.last_checkpoint_payload} />
        </div>

        <div>
          <p className="text-[11px] font-medium text-cyan-300/90 mb-2">Recent execution runs</p>
          {recentRuns.length === 0 ? (
            <p className="text-[11px] text-gray-500">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {recentRuns.map((run) => {
                const runStale = isExecutionStale(run.status, run.heartbeat_at);
                const tone = getExecutionStatusTone(run.status, runStale);
                const label = getExecutionStatusLabel(run.status, runStale);
                const delegation = getDelegationProvenance(run.metadata);
                const brokerage = getEscalationBrokerageProvenance(run.metadata);
                const observerAgentId = typeof run.metadata?.observer_agent_id === 'string' ? run.metadata.observer_agent_id : null;
                return (
                  <div key={run.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                      <div>
                        <p className="text-[11px] text-gray-200 font-medium">Attempt #{run.attempt}</p>
                        <p className="text-[10px] text-gray-500 font-mono break-all">{run.id}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase border ${tone}`}>
                        {label}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-400">
                      <p>Executor: <span className="text-gray-300">{formatAgentLabel(run.agent, run.agent_id)}</span></p>
                      <p>Delegated by: <span className="text-gray-300">{delegation ? formatAgentLabel(run.delegated_by_agent, delegation.delegatedByAgentId) : '—'}</span></p>
                      <p>Observer: <span className="text-gray-300">{observerAgentId ? formatAgentLabel(run.observer_agent, observerAgentId) : '—'}</span></p>
                      <p>Broker: <span className="text-gray-300">{brokerage?.brokerAgentId ? formatAgentLabel(run.broker_agent, brokerage.brokerAgentId) : '—'}</span></p>
                      <p>Started: <span className="text-gray-300">{formatExecutionTime(run.started_at)}</span></p>
                      <p>Heartbeat: <span className="text-gray-300">{formatExecutionTime(run.heartbeat_at)}</span></p>
                      <p>Completed: <span className="text-gray-300">{formatExecutionTime(run.completed_at)}</span></p>
                      <p>Checkpoints: <span className="text-gray-300">{run.checkpoint_count}</span></p>
                    </div>
                    {(run.summary || run.error_message || delegation || (activeRun?.id === run.id && task.last_checkpoint_summary)) && (
                      <div className="mt-2 text-[11px] text-gray-300 space-y-1">
                        {run.summary && <p><span className="text-gray-500">Summary:</span> {run.summary}</p>}
                        {!run.summary && activeRun?.id === run.id && task.last_checkpoint_summary && (
                          <p><span className="text-gray-500">Summary:</span> {task.last_checkpoint_summary}</p>
                        )}
                        {run.error_message && <p className="text-red-300"><span className="text-red-200/70">Error:</span> {run.error_message}</p>}
                        {delegation && (
                          <p>
                            <span className="text-gray-500">Delegation:</span> {formatAgentLabel(run.delegated_by_agent, delegation.delegatedByAgentId)} delegated execution
                            {delegation.delegatedByRunId ? <> from run <span className="font-mono text-[10px]">{delegation.delegatedByRunId}</span></> : null}
                            {delegation.delegationContractId ? <> via contract <span className="font-mono text-[10px]">{delegation.delegationContractId}</span></> : null}.
                          </p>
                        )}
                        {brokerage && (
                          <p>
                            <span className="text-gray-500">Brokerage:</span> {brokerage.brokerAgentId ? formatAgentLabel(run.broker_agent, brokerage.brokerAgentId) : 'Broker pending'}
                            {brokerage.brokerContractId ? <> via contract <span className="font-mono text-[10px]">{brokerage.brokerContractId}</span></> : null}
                            {brokerage.escalationReason ? <> · reason: {brokerage.escalationReason}</> : null}
                            {brokerage.requestedIntervention ? <> · ask: {brokerage.requestedIntervention}</> : null}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-medium text-cyan-300/90 mb-2">Recent checkpoints</p>
          {recentCheckpoints.length === 0 ? (
            <p className="text-[11px] text-gray-500">No checkpoints recorded.</p>
          ) : (
            <div className="space-y-2">
              {recentCheckpoints.map((checkpoint) => {
                const checkpointAttachments = attachments.filter((attachment) => checkpoint.attachment_ids?.includes(attachment.id));
                const delegation = getDelegationProvenance(checkpoint.payload);
                const brokerage = getEscalationBrokerageProvenance(checkpoint.payload);
                const observerAgentId = typeof checkpoint.payload?.observer_agent_id === 'string' ? checkpoint.payload.observer_agent_id : null;
                return (
                <div key={checkpoint.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-[11px] text-gray-200 font-medium">{checkpoint.summary || checkpoint.checkpoint_key}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{checkpoint.checkpoint_key} · #{checkpoint.sequence}</p>
                      <p className="text-[10px] text-gray-500 mt-1">Executor: {formatAgentLabel(checkpoint.agent, checkpoint.agent_id)}{delegation ? ` · Delegated by ${formatAgentLabel(checkpoint.delegated_by_agent, delegation.delegatedByAgentId)}` : ''}{observerAgentId ? ` · Observed by ${formatAgentLabel(checkpoint.observer_agent, observerAgentId)}` : ''}{brokerage?.brokerAgentId ? ` · Brokered by ${formatAgentLabel(checkpoint.broker_agent, brokerage.brokerAgentId)}` : ''}</p>
                    </div>
                    <span className="text-[10px] text-gray-500">{formatExecutionTime(checkpoint.created_at)}</span>
                  </div>
                  <div className="mt-2">
                    <JsonPayload payload={checkpoint.payload} />
                  </div>
                  {checkpointAttachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05]">
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.12em] mb-2">Attached artifacts</p>
                      <div className="space-y-1">
                        {checkpointAttachments.map((attachment) => (
                          <div key={attachment.id} className="text-[11px] text-gray-300 break-all">• {attachment.original_name}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

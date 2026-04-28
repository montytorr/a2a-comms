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

// Map the string tones returned by getExecutionStatusTone to design-system pill classes
function toneToClass(tone: string): string {
  if (tone.includes('mint') || tone.includes('emerald') || tone.includes('green')) return 'pill pill--mint';
  if (tone.includes('amber') || tone.includes('yellow') || tone.includes('orange')) return 'pill pill--amber';
  if (tone.includes('rose') || tone.includes('red')) return 'pill pill--rose';
  if (tone.includes('blue') || tone.includes('indigo') || tone.includes('cyan') || tone.includes('peri')) return 'pill pill--peri';
  return 'pill';
}

function JsonPayload({ payload }: { payload: Record<string, unknown> | null | undefined }) {
  if (!payload || Object.keys(payload).length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>No payload captured</span>;
  }

  return (
    <pre
      className="mono"
      style={{
        fontSize: 11,
        color: 'var(--fg-1)',
        background: 'var(--bg-0)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
        padding: 16,
        overflowX: 'auto',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function formatAgentLabel(agent?: { id?: string; name?: string; display_name?: string } | null, fallbackId?: string | null) {
  if (agent?.display_name) return agent.display_name;
  if (agent?.name) return agent.name;
  return fallbackId || 'Unknown';
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 6,
      border: '1px solid var(--line-1)',
      background: 'var(--bg-2)',
      padding: '8px 12px',
    }}>
      <p className="upper" style={{ color: 'var(--fg-4)', marginBottom: 4 }}>{label}</p>
      <div style={{ fontSize: 11, color: 'var(--fg-1)' }}>{children}</div>
    </div>
  );
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
    <div className="card animate-fade-in" style={{ padding: 24, animationDelay: '0.08s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="upper" style={{ color: 'var(--fg-4)' }}>Execution</p>
          <p style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 8 }}>{getExecutionSnapshotSummary(task)}</p>
        </div>
        <span className={toneToClass(statusTone)}>{statusLabel}</span>
      </div>

      {stale && (
        <div style={{
          marginBottom: 16,
          borderRadius: 6,
          border: '1px solid oklch(0.55 0.10 25 / 0.55)',
          background: 'var(--rose-bg)',
          padding: '12px 16px',
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--rose)' }}>Heartbeat stale</p>
          <p style={{ fontSize: 11, color: 'var(--fg-1)', marginTop: 4 }}>
            This task still shows as active, but the latest heartbeat is older than 15 minutes. Treat it as abandoned until a new heartbeat lands.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
        <MetaCell label="Active run">
          <span className="mono" style={{ wordBreak: 'break-all' }}>{task.active_run_id || 'None'}</span>
        </MetaCell>
        <MetaCell label="Latest checkpoint">
          {task.last_checkpoint_summary || 'None recorded'}
        </MetaCell>
        <MetaCell label="Started">
          {formatExecutionTime(task.execution_started_at)}
        </MetaCell>
        <MetaCell label="Heartbeat">
          {formatExecutionTime(task.execution_heartbeat_at)}
        </MetaCell>
        <div style={{ gridColumn: '1 / -1' }}>
          <MetaCell label="Completed">
            {formatExecutionTime(task.execution_completed_at)}
          </MetaCell>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--peri)' }}>Latest checkpoint payload</p>
            {task.last_checkpoint_at && (
              <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>{formatExecutionTime(task.last_checkpoint_at)}</span>
            )}
          </div>
          <JsonPayload payload={task.last_checkpoint_payload} />
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--peri)', marginBottom: 8 }}>Recent execution runs</p>
          {recentRuns.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--fg-3)' }}>No runs yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentRuns.map((run) => {
                const runStale = isExecutionStale(run.status, run.heartbeat_at);
                const tone = getExecutionStatusTone(run.status, runStale);
                const label = getExecutionStatusLabel(run.status, runStale);
                const delegation = getDelegationProvenance(run.metadata);
                const brokerage = getEscalationBrokerageProvenance(run.metadata);
                const observerAgentId = typeof run.metadata?.observer_agent_id === 'string' ? run.metadata.observer_agent_id : null;
                return (
                  <div key={run.id} style={{
                    borderRadius: 6,
                    border: '1px solid var(--line-1)',
                    background: 'var(--bg-2)',
                    padding: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--fg-1)', fontWeight: 500 }}>Attempt #{run.attempt}</p>
                        <p className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', wordBreak: 'break-all' }}>{run.id}</p>
                      </div>
                      <span className={toneToClass(tone)}>{label}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11, color: 'var(--fg-2)' }}>
                      <p>Executor: <span style={{ color: 'var(--fg-1)' }}>{formatAgentLabel(run.agent, run.agent_id)}</span></p>
                      <p>Delegated by: <span style={{ color: 'var(--fg-1)' }}>{delegation ? formatAgentLabel(run.delegated_by_agent, delegation.delegatedByAgentId) : '—'}</span></p>
                      <p>Observer: <span style={{ color: 'var(--fg-1)' }}>{observerAgentId ? formatAgentLabel(run.observer_agent, observerAgentId) : '—'}</span></p>
                      <p>Broker: <span style={{ color: 'var(--fg-1)' }}>{brokerage?.brokerAgentId ? formatAgentLabel(run.broker_agent, brokerage.brokerAgentId) : '—'}</span></p>
                      <p>Started: <span style={{ color: 'var(--fg-1)' }}>{formatExecutionTime(run.started_at)}</span></p>
                      <p>Heartbeat: <span style={{ color: 'var(--fg-1)' }}>{formatExecutionTime(run.heartbeat_at)}</span></p>
                      <p>Completed: <span style={{ color: 'var(--fg-1)' }}>{formatExecutionTime(run.completed_at)}</span></p>
                      <p>Checkpoints: <span style={{ color: 'var(--fg-1)' }}>{run.checkpoint_count}</span></p>
                    </div>
                    {(run.summary || run.error_message || delegation || (activeRun?.id === run.id && task.last_checkpoint_summary)) && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {run.summary && <p><span style={{ color: 'var(--fg-3)' }}>Summary:</span> {run.summary}</p>}
                        {!run.summary && activeRun?.id === run.id && task.last_checkpoint_summary && (
                          <p><span style={{ color: 'var(--fg-3)' }}>Summary:</span> {task.last_checkpoint_summary}</p>
                        )}
                        {run.error_message && (
                          <p style={{ color: 'var(--rose)' }}>
                            <span style={{ color: 'oklch(0.85 0.10 25)' }}>Error:</span> {run.error_message}
                          </p>
                        )}
                        {delegation && (
                          <p>
                            <span style={{ color: 'var(--fg-3)' }}>Delegation:</span> {formatAgentLabel(run.delegated_by_agent, delegation.delegatedByAgentId)} delegated execution
                            {delegation.delegatedByRunId ? <> from run <span className="mono" style={{ fontSize: 10 }}>{delegation.delegatedByRunId}</span></> : null}
                            {delegation.delegationContractId ? <> via contract <span className="mono" style={{ fontSize: 10 }}>{delegation.delegationContractId}</span></> : null}.
                          </p>
                        )}
                        {brokerage && (
                          <p>
                            <span style={{ color: 'var(--fg-3)' }}>Brokerage:</span> {brokerage.brokerAgentId ? formatAgentLabel(run.broker_agent, brokerage.brokerAgentId) : 'Broker pending'}
                            {brokerage.brokerContractId ? <> via contract <span className="mono" style={{ fontSize: 10 }}>{brokerage.brokerContractId}</span></> : null}
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
          <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--peri)', marginBottom: 8 }}>Recent checkpoints</p>
          {recentCheckpoints.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--fg-3)' }}>No checkpoints recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentCheckpoints.map((checkpoint) => {
                const checkpointAttachments = attachments.filter((attachment) => checkpoint.attachment_ids?.includes(attachment.id));
                const delegation = getDelegationProvenance(checkpoint.payload);
                const brokerage = getEscalationBrokerageProvenance(checkpoint.payload);
                const observerAgentId = typeof checkpoint.payload?.observer_agent_id === 'string' ? checkpoint.payload.observer_agent_id : null;
                return (
                  <div key={checkpoint.id} style={{
                    borderRadius: 6,
                    border: '1px solid var(--line-1)',
                    background: 'var(--bg-2)',
                    padding: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: 11, color: 'var(--fg-1)', fontWeight: 500 }}>{checkpoint.summary || checkpoint.checkpoint_key}</p>
                        <p className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{checkpoint.checkpoint_key} · #{checkpoint.sequence}</p>
                        <p style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>
                          Executor: {formatAgentLabel(checkpoint.agent, checkpoint.agent_id)}
                          {delegation ? ` · Delegated by ${formatAgentLabel(checkpoint.delegated_by_agent, delegation.delegatedByAgentId)}` : ''}
                          {observerAgentId ? ` · Observed by ${formatAgentLabel(checkpoint.observer_agent, observerAgentId)}` : ''}
                          {brokerage?.brokerAgentId ? ` · Brokered by ${formatAgentLabel(checkpoint.broker_agent, brokerage.brokerAgentId)}` : ''}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--fg-3)' }}>{formatExecutionTime(checkpoint.created_at)}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <JsonPayload payload={checkpoint.payload} />
                    </div>
                    {checkpointAttachments.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-1)' }}>
                        <p className="upper" style={{ color: 'var(--fg-4)', marginBottom: 8 }}>Attached artifacts</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {checkpointAttachments.map((attachment) => (
                            <div key={attachment.id} style={{ fontSize: 11, color: 'var(--fg-1)', wordBreak: 'break-all' }}>• {attachment.original_name}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

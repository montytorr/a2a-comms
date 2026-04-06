import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-context';
import { formatDateTime, formatRelative } from '@/lib/format-date';
import { getExecutionStatusLabel, getExecutionStatusTone, isExecutionStale } from '@/lib/task-execution-ui';
import { loadProtocolInspector } from '@/lib/protocol-inspector';
import type { TaskExecutionCheckpoint, TaskExecutionRun } from '@/lib/types';

export const dynamic = 'force-dynamic';

function SearchForm({ contractId, taskId }: { contractId: string; taskId: string }) {
  return (
    <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" action="/protocol-inspector" method="get">
      <div>
        <label htmlFor="contract" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
          Contract ID
        </label>
        <input
          id="contract"
          name="contract"
          defaultValue={contractId}
          placeholder="86e925fb-a2e4-41a3-a6a0-6b6ef114f7aa"
          className="w-full rounded-xl border border-white/[0.08] bg-[#09090f] px-3 py-2.5 text-[13px] text-gray-100 outline-none transition focus:border-cyan-400/50"
        />
      </div>
      <div>
        <label htmlFor="task" className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
          Task ID
        </label>
        <input
          id="task"
          name="task"
          defaultValue={taskId}
          placeholder="6a3aaf07-778b-41d6-87a0-c61ad00fc8c7"
          className="w-full rounded-xl border border-white/[0.08] bg-[#09090f] px-3 py-2.5 text-[13px] text-gray-100 outline-none transition focus:border-cyan-400/50"
        />
      </div>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="inline-flex h-[42px] items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/[0.12] px-4 text-[12px] font-semibold text-cyan-300 transition hover:bg-cyan-500/[0.18]"
        >
          Inspect
        </button>
        <Link
          href="/protocol-inspector"
          className="inline-flex h-[42px] items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-semibold text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

function StatCard({ label, value, tone = 'text-white' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl glass-card px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  if (!value || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0)) {
    return <p className="text-[11px] text-gray-500">No payload.</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/[0.05] bg-[#06060b]/80 p-3 text-[11px] leading-relaxed text-gray-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RunCard({ run }: { run: TaskExecutionRun }) {
  const stale = isExecutionStale(run.status, run.heartbeat_at);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-gray-100">Attempt #{run.attempt}</p>
          <p className="mt-1 font-mono text-[10px] text-gray-500">{run.id}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${getExecutionStatusTone(run.status, stale)}`}>
          {getExecutionStatusLabel(run.status, stale)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-[11px] text-gray-400 sm:grid-cols-2">
        <p>Started: <span className="text-gray-300">{run.started_at ? formatDateTime(run.started_at) : '—'}</span></p>
        <p>Heartbeat: <span className="text-gray-300">{run.heartbeat_at ? `${formatDateTime(run.heartbeat_at)} (${formatRelative(run.heartbeat_at)})` : '—'}</span></p>
        <p>Completed: <span className="text-gray-300">{run.completed_at ? formatDateTime(run.completed_at) : '—'}</span></p>
        <p>Checkpoints: <span className="text-gray-300">{run.checkpoint_count}</span></p>
      </div>
      {(run.summary || run.error_message) && (
        <div className="mt-3 space-y-1 text-[11px]">
          {run.summary && <p className="text-gray-300"><span className="text-gray-500">Summary:</span> {run.summary}</p>}
          {run.error_message && <p className="text-red-300"><span className="text-red-200/70">Error:</span> {run.error_message}</p>}
        </div>
      )}
    </div>
  );
}

function CheckpointCard({ checkpoint }: { checkpoint: TaskExecutionCheckpoint }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-gray-100">{checkpoint.summary || checkpoint.checkpoint_key}</p>
          <p className="mt-1 font-mono text-[10px] text-gray-500">{checkpoint.checkpoint_key} · seq {checkpoint.sequence}</p>
        </div>
        <span className="text-[10px] text-gray-500">{formatDateTime(checkpoint.created_at)}</span>
      </div>
      <div className="mt-3">
        <JsonBlock value={checkpoint.payload} />
      </div>
    </div>
  );
}

export default async function ProtocolInspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ contract?: string; task?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const contractId = (params.contract || '').trim();
  const taskId = (params.task || '').trim();
  noStore();

  const data = await loadProtocolInspector({
    contractId: contractId || null,
    taskId: taskId || null,
    agentIds: user.agentIds,
    isSuperAdmin: user.isSuperAdmin,
  });

  const searched = !!contractId || !!taskId;

  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-500/60">Debugging Cockpit</p>
          <h1 className="mt-2 text-[32px] font-bold tracking-tight text-white">Protocol Inspector</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500">
            One operator-facing view for contract state, message timeline, task linkage, execution evidence, webhook delivery, and obvious conformance drift.
          </p>
        </div>
      </div>

      <div className="rounded-2xl glass-card p-6">
        <SearchForm contractId={contractId} taskId={taskId} />
      </div>

      {!searched ? (
        <div className="mt-6 rounded-2xl glass-card px-6 py-10 text-center">
          <p className="text-sm text-gray-400">Enter a contract ID, task ID, or both.</p>
          <p className="mt-1 text-[12px] text-gray-600">The inspector will stitch together the visible flow instead of making you bounce across five screens like a lunatic.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-6">
            <StatCard label="Messages" value={data.conformance.messageCount} />
            <StatCard label="Linked Tasks" value={data.conformance.linkedTaskCount} />
            <StatCard label="Runs" value={data.conformance.runCount} />
            <StatCard label="Checkpoints" value={data.conformance.checkpointCount} />
            <StatCard label="Webhook Events" value={data.conformance.webhookEventCount} />
            <StatCard label="Drift Flags" value={data.conformance.driftFlags.length} tone={data.conformance.driftFlags.length ? 'text-red-300' : 'text-emerald-300'} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <section className="rounded-2xl glass-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Conformance Summary</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-white">Live sanity checks</h2>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      label: 'Contract visible',
                      ok: data.conformance.contractFound,
                      detail: data.contract ? `${data.contract.status} · ${data.contract.current_turns}/${data.contract.max_turns} turns` : 'Not found or not visible to this user',
                    },
                    {
                      label: 'Task visible',
                      ok: data.conformance.taskFound,
                      detail: data.task ? `${data.task.status} · ${data.task.execution_status || 'idle'}` : 'No task selected or linked',
                    },
                    {
                      label: 'Participants accepted',
                      ok: data.conformance.allParticipantsAccepted !== false,
                      detail: data.conformance.allParticipantsAccepted === null ? 'No contract in scope' : data.conformance.allParticipantsAccepted ? 'All visible participants accepted' : 'At least one participant is pending/rejected',
                    },
                    {
                      label: 'Task linkage exists',
                      ok: data.conformance.hasTaskLink,
                      detail: data.conformance.hasTaskLink ? `${data.conformance.linkedTaskCount} linked task(s)` : 'No contract ↔ task link found',
                    },
                    {
                      label: 'Execution evidence exists',
                      ok: data.conformance.hasActiveOrCompletedRun,
                      detail: data.conformance.hasActiveOrCompletedRun ? `${data.conformance.runCount} run(s)` : 'No task execution run found',
                    },
                    {
                      label: 'Checkpoint evidence exists',
                      ok: data.conformance.hasCheckpointEvidence,
                      detail: data.conformance.hasCheckpointEvidence ? `${data.conformance.checkpointCount} checkpoint(s)` : 'No checkpoint trail found',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-medium text-gray-200">{item.label}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${item.ok ? 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-300' : 'border-red-500/25 bg-red-500/[0.12] text-red-300'}`}>
                          {item.ok ? 'ok' : 'check'}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-gray-500">{item.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#09090f] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Drift flags</p>
                  {data.conformance.driftFlags.length === 0 ? (
                    <p className="mt-2 text-[12px] text-emerald-300">Nothing obviously cursed.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-[12px] text-red-200">
                      {data.conformance.driftFlags.map((flag) => (
                        <li key={flag} className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2">{flag}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-2xl glass-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Contract</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-white">Summary + timeline</h2>
                  </div>
                  {data.contract && (
                    <Link href={`/contracts/${data.contract.id}`} className="text-[12px] font-semibold text-cyan-300 hover:text-cyan-200">
                      Open contract →
                    </Link>
                  )}
                </div>

                {!data.contract ? (
                  <p className="text-[12px] text-gray-500">No visible contract in scope.</p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">Title</p>
                        <p className="mt-2 text-[13px] font-medium text-gray-100">{data.contract.title}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">Status</p>
                        <p className="mt-2 text-[13px] font-medium text-gray-100">{data.contract.status}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">Participants</p>
                        <p className="mt-2 text-[13px] font-medium text-gray-100">{data.contract.participants.length}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-gray-600">Turns</p>
                        <p className="mt-2 text-[13px] font-medium text-gray-100">{data.contract.current_turns}/{data.contract.max_turns}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Participants</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {data.contract.participants.map((participant) => (
                          <div key={participant.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[12px] font-medium text-gray-100">{participant.agent?.display_name || participant.agent?.name || 'Unknown agent'}</p>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${participant.status === 'accepted' ? 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-300' : participant.status === 'pending' ? 'border-amber-500/25 bg-amber-500/[0.12] text-amber-300' : 'border-red-500/25 bg-red-500/[0.12] text-red-300'}`}>
                                {participant.status}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-gray-500">{participant.role}{participant.responded_at ? ` · responded ${formatRelative(participant.responded_at)}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Message timeline</p>
                      {data.messages.length === 0 ? (
                        <p className="mt-3 text-[12px] text-gray-500">No messages visible.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {data.messages.map((message) => (
                            <div key={message.id} className="rounded-xl border border-white/[0.06] bg-[#09090f] p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-[12px] font-medium text-gray-100">{message.sender?.display_name || message.sender?.name || 'Unknown sender'}</p>
                                  <p className="mt-1 text-[11px] text-gray-500">{message.message_type} · {formatDateTime(message.created_at)} ({formatRelative(message.created_at)})</p>
                                </div>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-400">
                                  {message.message_type}
                                </span>
                              </div>
                              <div className="mt-3">
                                <JsonBlock value={message.content} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-2xl glass-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Tasks</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-white">Linked execution trail</h2>
                  </div>
                </div>

                {data.linkedTasks.length === 0 ? (
                  <p className="text-[12px] text-gray-500">No linked tasks found.</p>
                ) : (
                  <div className="space-y-3">
                    {data.linkedTasks.map((task) => {
                      const stale = isExecutionStale(task.execution_status || undefined, task.execution_heartbeat_at || undefined);
                      return (
                        <div key={task.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <Link href={`/projects/${task.project_id}/tasks/${task.id}`} className="text-[13px] font-semibold text-gray-100 hover:text-cyan-300">
                                {task.title}
                              </Link>
                              <p className="mt-1 text-[11px] text-gray-500">{task.project_title || task.project_id} · {task.status} · {task.priority}</p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${getExecutionStatusTone(task.execution_status, stale)}`}>
                              {getExecutionStatusLabel(task.execution_status, stale)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-[11px] text-gray-400">
                            <p>Assignee: <span className="text-gray-300">{task.assignee?.display_name || task.assignee?.name || '—'}</span></p>
                            <p>Last checkpoint: <span className="text-gray-300">{task.last_checkpoint_summary || '—'}</span></p>
                            <p>Linked via contract: <span className="font-mono text-gray-300">{task.linked_via_contract_id || 'Direct task lookup'}</span></p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-2xl glass-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Execution</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-white">Runs + checkpoints</h2>
                  </div>
                </div>

                <div className="space-y-3">
                  {data.executionRuns.length === 0 ? (
                    <p className="text-[12px] text-gray-500">No execution runs found.</p>
                  ) : (
                    data.executionRuns.map((run) => <RunCard key={run.id} run={run} />)
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {data.executionCheckpoints.length === 0 ? (
                    <p className="text-[12px] text-gray-500">No checkpoints found.</p>
                  ) : (
                    data.executionCheckpoints.map((checkpoint) => <CheckpointCard key={checkpoint.id} checkpoint={checkpoint} />)
                  )}
                </div>
              </section>

              <section className="rounded-2xl glass-card p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">Webhooks</p>
                    <h2 className="mt-1 text-[18px] font-semibold text-white">Delivery evidence</h2>
                  </div>
                  <Link href="/webhooks/health" className="text-[12px] font-semibold text-cyan-300 hover:text-cyan-200">
                    Health view →
                  </Link>
                </div>

                {data.webhookDeliveries.length === 0 ? (
                  <p className="text-[12px] text-gray-500">No matching webhook deliveries found in the recent audit window.</p>
                ) : (
                  <div className="space-y-3">
                    {data.webhookDeliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[12px] font-semibold text-gray-100">{delivery.event}</p>
                            <p className="mt-1 text-[11px] text-gray-500">{formatDateTime(delivery.created_at)} ({formatRelative(delivery.created_at)})</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${delivery.status === 'success' ? 'border-emerald-500/25 bg-emerald-500/[0.12] text-emerald-300' : delivery.status === 'failed' ? 'border-red-500/25 bg-red-500/[0.12] text-red-300' : 'border-amber-500/25 bg-amber-500/[0.12] text-amber-300'}`}>
                            {delivery.status}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-gray-400">
                          <p>Webhook: <span className="font-mono text-gray-300">{delivery.webhook?.url || delivery.webhook_id}</span></p>
                          <p>Attempts: <span className="text-gray-300">{delivery.attempts}{delivery.max_retries ? ` / ${delivery.max_retries}` : ''}</span></p>
                          <p>HTTP: <span className="text-gray-300">{delivery.response_status ?? '—'}</span></p>
                          <p>Related IDs: <span className="font-mono text-gray-300">contract={delivery.related_contract_id || '—'} task={delivery.related_task_id || '—'}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The database half of the operator channel. Split from the pure half so the
 * dashboard panel - a client component - can import the limits and the kind
 * descriptions without bundling `pg` for the browser. Same split as
 * `pulse.ts` / `pulse-server.ts`, and for the same reason.
 */

import { createServerClient } from '@/lib/db/server';
import { normalizeDatabaseValue, transaction } from '@/lib/db/client';
import { auditLog } from '@/lib/api-helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import {
  isOperatorQuestionKind,
  isUuid,
  refuse,
  safeIdList,
  summariseChannel,
  type ChannelRefusal,
  type ValidatedQuestion,
} from '@/lib/contract-operator-channel';
import type {
  OperatorChannelCounts,
  OperatorNoteSummary,
  OperatorQuestionKind,
  OperatorQuestionStatus,
  OperatorQuestionSummary,
} from '@/lib/types';

/* ── access ──────────────────────────────────────────────────────────────── */

function notAParticipant(contractId: string): ChannelRefusal {
  return refuse(404, `Contract ${contractId} not found, or you are not a participant in it.`, 'NOT_FOUND');
}

async function participantRole(contractId: string, agentId: string): Promise<string | undefined> {
  const db = createServerClient();
  const { data } = await db
    .from('contract_participants')
    .select('role')
    .eq('contract_id', contractId)
    .eq('agent_id', agentId)
    .limit(1)
    .maybeSingle();
  return (data as { role?: string } | null)?.role;
}

/**
 * Reading the channel is participation and nothing more. Observers are included
 * on the same reasoning as contract links: observing is reading, and a note
 * written to the participants of a contract an observer is watching is part of
 * what they are watching.
 */
export async function checkChannelReadAccess(
  contractId: string,
  agentId: string
): Promise<ChannelRefusal | null> {
  const role = await participantRole(contractId, agentId);
  return role === undefined ? notAParticipant(contractId) : null;
}

/**
 * Asking a human for a decision on a contract is an act on that contract, so
 * observers are excluded - they inspect, they do not participate. Same line
 * `contract-task-link.ts` and `contract-links.ts` draw.
 */
export async function checkChannelWriteAccess(
  contractId: string,
  agentId: string
): Promise<ChannelRefusal | null> {
  const role = await participantRole(contractId, agentId);
  if (role === undefined) return notAParticipant(contractId);
  if (role === 'observer') {
    return refuse(403, 'Observers may read the operator channel but cannot ask questions on it.', 'FORBIDDEN');
  }
  return null;
}

/* ── reads ───────────────────────────────────────────────────────────────── */

interface NoteRow {
  id: string;
  contract_id: string;
  body: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  withdrawn_at: string | null;
}

interface QuestionRow {
  id: string;
  contract_id: string;
  kind: string;
  body: string;
  blocking: boolean;
  status: string;
  asked_by_agent_id: string;
  answer: string | null;
  answered_by_name: string | null;
  created_at: string;
  answered_at: string | null;
  agent?: { name?: string | null; display_name?: string | null } | Array<{ name?: string | null; display_name?: string | null }>;
}

const NOTE_SELECT = 'id, contract_id, body, author_name, created_at, updated_at, withdrawn_at';
const QUESTION_SELECT =
  'id, contract_id, kind, body, blocking, status, asked_by_agent_id, answer, answered_by_name, created_at, answered_at, ' +
  'agent:agents!asked_by_agent_id(name, display_name)';

function one<T>(value: T | T[] | undefined | null): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function toQuestion(row: QuestionRow): OperatorQuestionSummary | null {
  if (!isOperatorQuestionKind(row.kind)) return null;
  const agent = one(row.agent);
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    blocking: row.blocking === true,
    status: row.status as OperatorQuestionStatus,
    asked_by_agent_id: row.asked_by_agent_id,
    asked_by_agent_name: agent?.display_name || agent?.name || null,
    created_at: row.created_at,
    answer: row.answer,
    answered_by_name: row.answered_by_name,
    answered_at: row.answered_at,
  };
}

export interface OperatorChannel {
  notes: OperatorNoteSummary[];
  questions: OperatorQuestionSummary[];
  counts: OperatorChannelCounts;
}

const EMPTY_COUNTS: OperatorChannelCounts = Object.freeze({
  notes: 0,
  unacknowledged_notes: null,
  open_questions: 0,
  blocking_questions: 0,
});

/**
 * The whole channel for one contract.
 *
 * `includeWithdrawn` exists for the dashboard, where the operator who withdrew
 * a note is the one person entitled to see that it was ever there. Agents only
 * ever get the live set: a withdrawn instruction that kept arriving would be
 * worse than one that never arrived.
 */
export async function getOperatorChannel(
  contractId: string,
  viewerAgentId: string | null,
  options: { includeWithdrawn?: boolean } = {}
): Promise<OperatorChannel> {
  const byContract = await getOperatorChannelForContracts([contractId], viewerAgentId, options);
  return byContract.get(contractId) ?? { notes: [], questions: [], counts: { ...EMPTY_COUNTS } };
}

/**
 * Batched, because the contracts list enriches up to a page of contracts at
 * once and a per-contract round trip there is how a list page becomes slow.
 */
export async function getOperatorChannelForContracts(
  contractIds: string[],
  viewerAgentId: string | null,
  options: { includeWithdrawn?: boolean } = {}
): Promise<Map<string, OperatorChannel>> {
  const result = new Map<string, OperatorChannel>();
  const ids = safeIdList(contractIds);
  if (ids.length === 0) return result;

  const db = createServerClient();

  const { data: noteRows } = await db
    .from('contract_notes')
    .select(NOTE_SELECT)
    .in('contract_id', ids)
    .order('created_at', { ascending: true });

  const { data: questionRows } = await db
    .from('contract_questions')
    .select(QUESTION_SELECT)
    .in('contract_id', ids)
    .order('created_at', { ascending: true });

  const notes = (noteRows || []) as NoteRow[];
  const questions = (questionRows || []) as QuestionRow[];

  // One acknowledgement lookup for the whole page rather than one per note.
  const acked = new Set<string>();
  if (viewerAgentId && isUuid(viewerAgentId) && notes.length > 0) {
    const { data: ackRows } = await db
      .from('contract_note_acks')
      .select('note_id')
      .eq('agent_id', viewerAgentId)
      .in('note_id', notes.map((note) => note.id));
    for (const row of (ackRows || []) as Array<{ note_id: string }>) acked.add(row.note_id);
  }

  for (const id of ids) result.set(id, { notes: [], questions: [], counts: { ...EMPTY_COUNTS } });

  for (const row of notes) {
    const bucket = result.get(row.contract_id);
    if (!bucket) continue;
    if (row.withdrawn_at !== null && !options.includeWithdrawn) continue;
    bucket.notes.push({
      id: row.id,
      body: row.body,
      author_name: row.author_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
      withdrawn_at: row.withdrawn_at,
      acknowledged: viewerAgentId ? acked.has(row.id) : null,
    });
  }

  for (const row of questions) {
    const bucket = result.get(row.contract_id);
    if (!bucket) continue;
    const question = toQuestion(row);
    if (question) bucket.questions.push(question);
  }

  for (const bucket of result.values()) {
    bucket.counts = summariseChannel(bucket.notes, bucket.questions, Boolean(viewerAgentId));
  }

  return result;
}

/* ── writes ──────────────────────────────────────────────────────────────── */

export async function createContractNote(params: {
  contractId: string;
  body: string;
  authorUserId: string | null;
  authorName: string;
}): Promise<{ ok: true; id: string } | ({ ok: false } & ChannelRefusal)> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_notes')
    .insert({
      contract_id: params.contractId,
      body: params.body,
      author_user_id: params.authorUserId,
      author_name: params.authorName,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, ...refuse(500, 'Could not save the note.', 'INTERNAL_ERROR', error?.message) };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateContractNote(
  noteId: string,
  body: string
): Promise<ChannelRefusal | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .is('withdrawn_at', null)
    .select('id')
    .maybeSingle();

  if (error) return refuse(500, 'Could not update the note.', 'INTERNAL_ERROR', error.message);
  if (!data) return refuse(404, 'Note not found, or it has already been withdrawn.', 'NOT_FOUND');
  return null;
}

/**
 * Withdrawal is a timestamp, not a delete. An agent that acted on a note needs
 * the note to still exist when someone asks why it did that - and editing a
 * note out of existence is exactly the failure that put contract succession
 * into a real table instead of the description string.
 */
export async function withdrawContractNote(noteId: string): Promise<ChannelRefusal | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_notes')
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('id', noteId)
    .is('withdrawn_at', null)
    .select('id')
    .maybeSingle();

  if (error) return refuse(500, 'Could not withdraw the note.', 'INTERNAL_ERROR', error.message);
  if (!data) return refuse(404, 'Note not found, or it was already withdrawn.', 'NOT_FOUND');
  return null;
}

/**
 * Acknowledge notes. Returns how many rows were newly written, so the caller can
 * say "3 acknowledged" rather than claiming an effect it did not have - the
 * lesson from `deleteContractLink` reporting removals that never happened.
 */
export async function acknowledgeContractNotes(params: {
  contractId: string;
  agentId: string;
  noteIds?: string[] | null;
}): Promise<{ ok: true; acknowledged: number; already: number } | ({ ok: false } & ChannelRefusal)> {
  const db = createServerClient();

  const { data: liveRows } = await db
    .from('contract_notes')
    .select('id')
    .eq('contract_id', params.contractId)
    .is('withdrawn_at', null);

  let live = ((liveRows || []) as Array<{ id: string }>).map((row) => row.id);

  if (params.noteIds && params.noteIds.length > 0) {
    const wanted = new Set(safeIdList(params.noteIds));
    const missing = [...wanted].filter((id) => !live.includes(id));
    if (missing.length > 0) {
      return {
        ok: false,
        ...refuse(
          404,
          `No live note on this contract with id ${missing[0]}.`,
          'NOT_FOUND',
        ),
      };
    }
    live = live.filter((id) => wanted.has(id));
  }

  if (live.length === 0) return { ok: true, acknowledged: 0, already: 0 };

  const { data: existing } = await db
    .from('contract_note_acks')
    .select('note_id')
    .eq('agent_id', params.agentId)
    .in('note_id', live);
  const already = new Set(((existing || []) as Array<{ note_id: string }>).map((row) => row.note_id));

  const fresh = live.filter((id) => !already.has(id));
  if (fresh.length > 0) {
    const { error } = await db
      .from('contract_note_acks')
      .insert(fresh.map((id) => ({ note_id: id, agent_id: params.agentId })));
    if (error) {
      return { ok: false, ...refuse(500, 'Could not record the acknowledgement.', 'INTERNAL_ERROR', error.message) };
    }
  }

  return { ok: true, acknowledged: fresh.length, already: already.size };
}

export async function createContractQuestion(params: {
  contractId: string;
  agentId: string;
  kind: OperatorQuestionKind;
  body: string;
  blocking: boolean;
}): Promise<{ ok: true; id: string } | ({ ok: false } & ChannelRefusal)> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_questions')
    .insert({
      contract_id: params.contractId,
      asked_by_agent_id: params.agentId,
      kind: params.kind,
      body: params.body,
      blocking: params.blocking,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, ...refuse(500, 'Could not record the question.', 'INTERNAL_ERROR', error?.message) };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Tell everyone a question was asked: the audit trail, and the peers by webhook.
 * Shared by `holloway ask` and a message sent with `needs_human`, so the two
 * ways of asking cannot drift apart in what they announce.
 *
 * The peers' event is explicitly not action-required: the answer is owed by a
 * person, not by them, and a reactor that woke an agent for this would wake it
 * to do nothing.
 */
export async function announceContractQuestion(params: {
  contractId: string;
  questionId: string;
  agent: { id: string; name: string };
  question: ValidatedQuestion;
  messageId?: string | null;
  ipAddress?: string;
}): Promise<void> {
  const { contractId, questionId, agent, question } = params;
  await auditLog({
    actor: agent.name,
    action: 'contract.question_asked',
    resourceType: 'contract',
    resourceId: contractId,
    details: {
      question_id: questionId,
      kind: question.kind,
      blocking: question.blocking,
      ...(params.messageId ? { message_id: params.messageId } : {}),
    },
    ipAddress: params.ipAddress,
  });

  const db = createServerClient();
  const { data: participantRows } = await db
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', contractId);
  const peers = ((participantRows || []) as Array<{ agent_id: string }>)
    .map((row) => row.agent_id)
    .filter((agentId) => agentId !== agent.id);
  if (peers.length === 0) return;

  deliverWebhooks(peers, {
    event: 'contract.question_asked',
    contract_id: contractId,
    data: {
      question_id: questionId,
      asked_by: agent.name,
      asked_by_agent_id: agent.id,
      kind: question.kind,
      blocking: question.blocking,
      body: question.body,
      ...(params.messageId ? { message_id: params.messageId } : {}),
      requires_action: false,
      attention: 'informational',
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {});
}

/**
 * Store a message and open the question it hands to a person, or neither.
 *
 * One transaction, because the two halves are only correct together: the
 * message is stored with requires_action false on the promise that a person
 * has been asked, and a question without its message would show in the
 * dashboard with nothing in the thread explaining it. The RPC is the same
 * insert_message_atomic every other send uses, so the turn accounting is
 * identical.
 */
export async function insertMessageWithQuestion(params: {
  contractId: string;
  senderId: string;
  messageType: string;
  content: Record<string, unknown>;
  approvesCompletion: boolean;
  question: ValidatedQuestion;
}): Promise<
  | { ok: true; rpcResult: Record<string, unknown>; questionId: string | null }
  | ({ ok: false } & ChannelRefusal)
> {
  try {
    return await transaction(async (client) => {
      const { rows } = await client.query<{ result: unknown }>(
        `select insert_message_atomic(
           p_contract_id => $1, p_sender_id => $2, p_message_type => $3, p_content => $4,
           p_approves_completion => $5, p_requires_action => false
         ) as result`,
        [params.contractId, params.senderId, params.messageType, params.content, params.approvesCompletion],
      );
      const rpcResult = normalizeDatabaseValue(rows[0]?.result ?? {}) as Record<string, unknown>;
      // A refusal from the RPC (turn cap, state) inserted nothing, so there is
      // nothing for a question to be about.
      if (rpcResult.error) return { ok: true as const, rpcResult, questionId: null };

      const inserted = await client.query<{ id: string }>(
        `insert into contract_questions (contract_id, asked_by_agent_id, kind, body, blocking, message_id)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [
          params.contractId,
          params.senderId,
          params.question.kind,
          params.question.body,
          params.question.blocking,
          rpcResult.message_id,
        ],
      );
      return { ok: true as const, rpcResult, questionId: inserted.rows[0]!.id };
    });
  } catch (error) {
    const pgCode = (error as { code?: string } | null)?.code;
    // 42703: undefined column. The code shipped before its migration.
    if (pgCode === '42703') {
      return {
        ok: false,
        ...refuse(
          500,
          'needs_human is not available yet: contract_questions.message_id is missing. Apply migrations/20260923120000_contract_question_message_link.sql. Nothing was sent; send without needs_human and use holloway ask meanwhile.',
          'MIGRATION_MISSING',
        ),
      };
    }
    return {
      ok: false,
      ...refuse(500, 'Could not send the message and open the question. Nothing was sent.', 'DB_ERROR', (error as Error)?.message),
    };
  }
}

/**
 * Which messages opened which questions, for the thread. Read separately from
 * the channel rather than added to QUESTION_SELECT, so a database that has not
 * had the message_id migration yet loses only the "Asked a person" marker and
 * not the whole operator channel.
 */
export async function getQuestionIdsByMessage(contractId: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!isUuid(contractId)) return links;
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_questions')
    .select('id, message_id')
    .eq('contract_id', contractId)
    .not('message_id', 'is', null);
  if (error) return links;
  for (const row of (data || []) as Array<{ id: string; message_id: string | null }>) {
    if (row.message_id) links.set(row.message_id, row.id);
  }
  return links;
}

/**
 * What the handoff detector needs about one contract: whether a person has
 * already been asked (in which case a prose handoff is just a restatement),
 * and who the people and the agents are.
 *
 * The people are the owners of the participating agents, the super admins who
 * can see every contract, and anyone who has written a note or answered a
 * question on this one - the same operators the dashboard names.
 */
export async function getHumanHandoffContext(contractId: string): Promise<{
  hasOpenBlockingQuestion: boolean;
  humanNames: string[];
  agentNames: string[];
}> {
  const db = createServerClient();
  const [questionsResult, participantsResult, notesResult, adminsResult] = await Promise.all([
    db.from('contract_questions').select('status, blocking, answered_by_name').eq('contract_id', contractId),
    db.from('contract_participants').select('agent:agents(name, display_name, owner_user_id)').eq('contract_id', contractId),
    db.from('contract_notes').select('author_name').eq('contract_id', contractId),
    db.from('user_profiles').select('display_name').eq('is_super_admin', true),
  ]);

  const questions = (questionsResult.data || []) as Array<{ status: string; blocking: boolean; answered_by_name: string | null }>;
  type AgentRow = { name?: string | null; display_name?: string | null; owner_user_id?: string | null };
  const agents = ((participantsResult.data || []) as Array<{ agent?: AgentRow | AgentRow[] | null }>)
    .map((row) => one(row.agent))
    .filter((agent): agent is AgentRow => Boolean(agent));

  const ownerIds = safeIdList(agents.map((agent) => agent.owner_user_id ?? '').filter(Boolean));
  const { data: owners } = ownerIds.length
    ? await db.from('user_profiles').select('display_name').in('id', ownerIds)
    : { data: [] };

  const humanNames = [
    ...((owners || []) as Array<{ display_name: string | null }>).map((row) => row.display_name),
    ...((adminsResult.data || []) as Array<{ display_name: string | null }>).map((row) => row.display_name),
    ...((notesResult.data || []) as Array<{ author_name: string | null }>).map((row) => row.author_name),
    ...questions.map((row) => row.answered_by_name),
  ].filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  return {
    hasOpenBlockingQuestion: questions.some((row) => row.status === 'open' && row.blocking === true),
    humanNames,
    agentNames: agents.flatMap((agent) => [agent.name, agent.display_name]).filter((name): name is string => Boolean(name)),
  };
}

/**
 * Answer or dismiss, in one place because they are the same state transition
 * with a different reason, and because both must be conditional on the question
 * still being open or two operators racing would each believe they answered it.
 */
export async function resolveContractQuestion(params: {
  questionId: string;
  status: 'answered' | 'dismissed';
  answer: string | null;
  answeredByUserId: string | null;
  answeredByName: string;
}): Promise<{ ok: true; question: OperatorQuestionSummary } | ({ ok: false } & ChannelRefusal)> {
  const db = createServerClient();
  const { data, error } = await db
    .from('contract_questions')
    .update({
      status: params.status,
      answer: params.answer,
      answered_by_user_id: params.answeredByUserId,
      answered_by_name: params.answeredByName,
      answered_at: new Date().toISOString(),
    })
    .eq('id', params.questionId)
    .eq('status', 'open')
    .select(QUESTION_SELECT)
    .maybeSingle();

  if (error) return { ok: false, ...refuse(500, 'Could not save the answer.', 'INTERNAL_ERROR', error.message) };
  if (!data) {
    return {
      ok: false,
      ...refuse(409, 'That question is no longer open - someone has already answered or dismissed it.', 'ALREADY_RESPONDED'),
    };
  }

  const question = toQuestion(data as QuestionRow);
  if (!question) return { ok: false, ...refuse(500, 'Saved the answer but could not read it back.', 'INTERNAL_ERROR') };
  return { ok: true, question };
}

/**
 * How many agents have acknowledged each note. For the dashboard, which shows
 * "read by 2 of 3" - the operator's only way to tell whether an instruction
 * landed, which is the difference between leaving a note and knowing it was
 * read.
 */
export async function getNoteAckCounts(noteIds: string[]): Promise<Record<string, number>> {
  const ids = safeIdList(noteIds);
  if (ids.length === 0) return {};

  const db = createServerClient();
  const { data } = await db.from('contract_note_acks').select('note_id').in('note_id', ids);

  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  for (const row of ((data || []) as Array<{ note_id: string }>)) {
    counts[row.note_id] = (counts[row.note_id] ?? 0) + 1;
  }
  return counts;
}

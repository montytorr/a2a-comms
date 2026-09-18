/**
 * The database half of the operator channel. Split from the pure half so the
 * dashboard panel - a client component - can import the limits and the kind
 * descriptions without bundling `pg` for the browser. Same split as
 * `pulse.ts` / `pulse-server.ts`, and for the same reason.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  isOperatorQuestionKind,
  isUuid,
  refuse,
  safeIdList,
  summariseChannel,
  type ChannelRefusal,
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
  const supabase = createServerClient();
  const { data } = await supabase
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

  const supabase = createServerClient();

  const { data: noteRows } = await supabase
    .from('contract_notes')
    .select(NOTE_SELECT)
    .in('contract_id', ids)
    .order('created_at', { ascending: true });

  const { data: questionRows } = await supabase
    .from('contract_questions')
    .select(QUESTION_SELECT)
    .in('contract_id', ids)
    .order('created_at', { ascending: true });

  const notes = (noteRows || []) as NoteRow[];
  const questions = (questionRows || []) as QuestionRow[];

  // One acknowledgement lookup for the whole page rather than one per note.
  const acked = new Set<string>();
  if (viewerAgentId && isUuid(viewerAgentId) && notes.length > 0) {
    const { data: ackRows } = await supabase
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
  const supabase = createServerClient();
  const { data, error } = await supabase
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
  const supabase = createServerClient();
  const { data, error } = await supabase
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
  const supabase = createServerClient();
  const { data, error } = await supabase
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
  const supabase = createServerClient();

  const { data: liveRows } = await supabase
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

  const { data: existing } = await supabase
    .from('contract_note_acks')
    .select('note_id')
    .eq('agent_id', params.agentId)
    .in('note_id', live);
  const already = new Set(((existing || []) as Array<{ note_id: string }>).map((row) => row.note_id));

  const fresh = live.filter((id) => !already.has(id));
  if (fresh.length > 0) {
    const { error } = await supabase
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
  const supabase = createServerClient();
  const { data, error } = await supabase
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
  const supabase = createServerClient();
  const { data, error } = await supabase
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

  const supabase = createServerClient();
  const { data } = await supabase.from('contract_note_acks').select('note_id').in('note_id', ids);

  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  for (const row of ((data || []) as Array<{ note_id: string }>)) {
    counts[row.note_id] = (counts[row.note_id] ?? 0) + 1;
  }
  return counts;
}

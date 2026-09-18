'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getAuthActorContext, type AuthActorContext } from '@/lib/auth-actor-context';
import { EMPTY_UUID } from '@/lib/dashboard-actor-helpers';
import { deliverWebhooks } from '@/lib/webhooks';
import { validateAnswerBody, validateNoteBody } from '@/lib/contract-operator-channel';
import {
  createContractNote,
  resolveContractQuestion,
  updateContractNote,
  withdrawContractNote,
} from '@/lib/contract-operator-channel-server';

/**
 * The human half of the operator channel.
 *
 * Notes and answers are written from here and nowhere else. The v1 API is
 * HMAC-only, so anything written through it is written by an agent - and an
 * agent that could author an operator note could put words in a person's mouth
 * on the one surface that person has.
 */

/**
 * Who may write on a contract's operator channel.
 *
 * A super admin, or a human who owns an agent participating in the contract.
 * Observer ownership is enough to READ the contract but not to instruct its
 * participants, which is the same line every other write on a contract draws.
 */
async function requireOperator(contractId: string): Promise<{ auth: AuthActorContext; actor: string }> {
  const auth = await getAuthActorContext();
  const user = auth?.user ?? null;
  if (!user || !auth) throw new Error('Unauthorized');

  const actor = user.displayName || user.email || 'Operator';

  if (user.isSuperAdmin) return { auth, actor };

  const supabase = createServerClient();
  const { data: participation } = await supabase
    .from('contract_participants')
    .select('role')
    .eq('contract_id', contractId)
    .in('agent_id', auth.agentScope.length > 0 ? auth.agentScope : [EMPTY_UUID])
    .limit(1);

  if (!participation || participation.length === 0) {
    throw new Error('Forbidden: not a participant');
  }
  if (participation[0]?.role === 'observer') {
    throw new Error('Forbidden: observers may read the operator channel but cannot write on it');
  }
  return { auth, actor };
}

function unwrap<T extends { ok: boolean }>(result: T | null, fallback: string): asserts result is T {
  if (result && 'ok' in result && result.ok === false) {
    throw new Error(((result as unknown as { body?: { error?: string } }).body?.error) ?? fallback);
  }
}

async function audit(action: string, contractId: string, actor: string, details: Record<string, unknown>) {
  const supabase = createServerClient();
  await supabase.from('audit_log').insert({
    actor,
    action,
    resource_type: 'contract',
    resource_id: contractId,
    details,
  });
}

export async function addContractNote(contractId: string, formData: FormData) {
  const { auth, actor } = await requireOperator(contractId);

  const body = validateNoteBody(formData.get('body'));
  if (!body.ok) throw new Error(body.body.error);

  const created = await createContractNote({
    contractId,
    body: body.value,
    authorUserId: auth.user.id,
    authorName: actor,
  });
  unwrap(created, 'Could not save the note.');
  if (!created.ok) return;

  await audit('contract.note_added', contractId, actor, { note_id: created.id });

  // Told, not woken. A note takes effect on the next read by design: it is
  // standing context, not an interruption, and an agent dragged out of
  // whatever it was doing to be handed a paragraph of instruction would have
  // to decide on the spot whether it supersedes the message it was answering.
  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from('contract_participants')
    .select('agent_id')
    .eq('contract_id', contractId);
  const participants = ((rows || []) as Array<{ agent_id: string }>).map((row) => row.agent_id);
  if (participants.length > 0) {
    deliverWebhooks(participants, {
      event: 'contract.note_added',
      contract_id: contractId,
      data: {
        note_id: created.id,
        author: actor,
        body: body.value,
        requires_action: false,
        attention: 'informational',
      },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  revalidatePath(`/contracts/${contractId}`);
}

export async function editContractNote(contractId: string, noteId: string, formData: FormData) {
  const { actor } = await requireOperator(contractId);

  const body = validateNoteBody(formData.get('body'));
  if (!body.ok) throw new Error(body.body.error);

  const failure = await updateContractNote(noteId, body.value);
  if (failure) throw new Error(failure.body.error);

  // An edit clears nobody's acknowledgement on purpose. Acknowledging says "I
  // have read this note", and the alternative - silently un-acknowledging on
  // every typo fix - would train agents to ignore the count.
  await audit('contract.note_edited', contractId, actor, { note_id: noteId });
  revalidatePath(`/contracts/${contractId}`);
}

export async function withdrawNote(contractId: string, noteId: string) {
  const { actor } = await requireOperator(contractId);

  const failure = await withdrawContractNote(noteId);
  if (failure) throw new Error(failure.body.error);

  await audit('contract.note_withdrawn', contractId, actor, { note_id: noteId });
  revalidatePath(`/contracts/${contractId}`);
}

/**
 * Answer a question, or dismiss it.
 *
 * This one IS a wake. The agent that asked has stopped and is waiting; the
 * answer is the entire reason it stopped, and delivering it on the next read
 * would mean waiting for a read that - if the question was blocking - is not
 * going to happen.
 */
async function resolve(
  contractId: string,
  questionId: string,
  status: 'answered' | 'dismissed',
  answer: string | null,
) {
  const { auth, actor } = await requireOperator(contractId);

  const resolved = await resolveContractQuestion({
    questionId,
    status,
    answer,
    answeredByUserId: auth.user.id,
    answeredByName: actor,
  });
  if (!resolved.ok) throw new Error(resolved.body.error);

  await audit(`contract.question_${status}`, contractId, actor, { question_id: questionId });

  deliverWebhooks([resolved.question.asked_by_agent_id], {
    event: 'contract.question_answered',
    contract_id: contractId,
    data: {
      question_id: questionId,
      status,
      kind: resolved.question.kind,
      question: resolved.question.body,
      answer,
      answered_by: actor,
      // The agent asked and stopped. This is the thing it stopped for.
      requires_action: true,
      attention: 'action-required',
    },
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  revalidatePath(`/contracts/${contractId}`);
}

export async function answerQuestion(contractId: string, questionId: string, formData: FormData) {
  const answer = validateAnswerBody(formData.get('answer'));
  if (!answer.ok) throw new Error(answer.body.error);
  await resolve(contractId, questionId, 'answered', answer.value);
}

/**
 * Dismissing is a real outcome, not a tidy-up: it says the question does not
 * need answering. It still wakes the asker, because an agent that stopped for
 * an answer has to be told that none is coming.
 */
export async function dismissQuestion(contractId: string, questionId: string) {
  await resolve(contractId, questionId, 'dismissed', null);
}

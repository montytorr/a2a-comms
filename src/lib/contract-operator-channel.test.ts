import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_NOTE_BODY_MAX,
  CONTRACT_QUESTION_BODY_MAX,
  OPERATOR_QUESTION_KINDS,
  defaultBlockingForKind,
  describeChannelState,
  describeQuestionKind,
  isOperatorQuestionKind,
  summariseChannel,
  validateAnswerBody,
  validateNoteBody,
  validateNeedsHuman,
  validateQuestionRequest,
} from '@/lib/contract-operator-channel';
import type { OperatorNoteSummary, OperatorQuestionSummary } from '@/lib/types';

const note = (over: Partial<OperatorNoteSummary> = {}): OperatorNoteSummary => ({
  id: '11111111-1111-4111-8111-111111111111',
  body: 'Use the staging bucket, not production.',
  author_name: 'Cal',
  created_at: '2026-09-18T10:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
  withdrawn_at: null,
  acknowledged: false,
  ...over,
});

const question = (over: Partial<OperatorQuestionSummary> = {}): OperatorQuestionSummary => ({
  id: '22222222-2222-4222-8222-222222222222',
  kind: 'question',
  body: 'Which bucket?',
  blocking: false,
  status: 'open',
  asked_by_agent_id: '33333333-3333-4333-8333-333333333333',
  asked_by_agent_name: 'clawclaw',
  created_at: '2026-09-18T10:05:00Z',
  answer: null,
  answered_by_name: null,
  answered_at: null,
  ...over,
});

test('the kind vocabulary is closed and every kind is explained', () => {
  assert.deepEqual([...OPERATOR_QUESTION_KINDS], ['question', 'validation', 'blocked']);
  for (const kind of OPERATOR_QUESTION_KINDS) {
    assert.ok(describeQuestionKind(kind).length > 20, `${kind} needs a real explanation`);
  }
  assert.equal(isOperatorQuestionKind('urgent'), false);
  assert.equal(isOperatorQuestionKind(null), false);
});

test('only blocked defaults to blocking', () => {
  assert.equal(defaultBlockingForKind('blocked'), true);
  assert.equal(defaultBlockingForKind('question'), false);
  assert.equal(defaultBlockingForKind('validation'), false);
});

test('a whitespace-only note is refused rather than stored', () => {
  const result = validateNoteBody('   \n\t ');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.match(result.body.error, /cannot be empty/);
});

test('a note body is trimmed, and its length is reported when it is too long', () => {
  const ok = validateNoteBody('  keep this  ');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, 'keep this');

  const long = validateNoteBody('x'.repeat(CONTRACT_NOTE_BODY_MAX + 7));
  assert.equal(long.ok, false);
  if (long.ok) return;
  // The count has to be the trimmed length the caller would have to cut to.
  assert.match(long.body.error, new RegExp(`${CONTRACT_NOTE_BODY_MAX + 7} characters`));
  assert.match(long.body.error, new RegExp(`maximum is ${CONTRACT_NOTE_BODY_MAX}`));
});

test('a missing kind means a plain question, not a rejection', () => {
  const result = validateQuestionRequest({ body: 'Which bucket?' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.kind, 'question');
  assert.equal(result.value.blocking, false);
});

test('an unknown kind is refused, and the refusal lists the kinds with their meanings', () => {
  const result = validateQuestionRequest({ kind: 'urgent', body: 'help' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.body.code, 'VALIDATION_ERROR');
  for (const kind of OPERATOR_QUESTION_KINDS) {
    assert.match(String(result.body.details), new RegExp(kind));
  }
});

test('kind blocked implies blocking, and an agent may still say it can carry on', () => {
  const implied = validateQuestionRequest({ kind: 'blocked', body: 'No credentials.' });
  assert.equal(implied.ok, true);
  if (implied.ok) assert.equal(implied.value.blocking, true);

  // Only the agent knows whether it can proceed, so an explicit false wins over
  // the default the kind would have implied.
  const overridden = validateQuestionRequest({ kind: 'blocked', body: 'No credentials.', blocking: false });
  assert.equal(overridden.ok, true);
  if (overridden.ok) assert.equal(overridden.value.blocking, false);

  const raised = validateQuestionRequest({ kind: 'question', body: 'Which bucket?', blocking: true });
  assert.equal(raised.ok, true);
  if (raised.ok) assert.equal(raised.value.blocking, true);
});

test('a question body has its own, shorter limit', () => {
  const tooLong = validateQuestionRequest({ body: 'x'.repeat(CONTRACT_QUESTION_BODY_MAX + 1) });
  assert.equal(tooLong.ok, false);
  const wouldFitANote = validateNoteBody('x'.repeat(CONTRACT_QUESTION_BODY_MAX + 1));
  assert.equal(wouldFitANote.ok, true);
});

test('an empty answer is refused — dismissing is a different act from answering with nothing', () => {
  assert.equal(validateAnswerBody('').ok, false);
  assert.equal(validateAnswerBody('   ').ok, false);
  assert.equal(validateAnswerBody('the staging one').ok, true);
});

test('withdrawn notes and resolved questions are not counted', () => {
  const counts = summariseChannel(
    [note(), note({ id: 'b', withdrawn_at: '2026-09-18T11:00:00Z' })],
    [question(), question({ id: 'c', status: 'answered' })],
    true,
  );
  assert.equal(counts.notes, 1);
  assert.equal(counts.open_questions, 1);
});

test('unacknowledged is null, not zero, when no agent asked', () => {
  // Zero would read as "you have acknowledged everything", which is a claim
  // about an agent that was never identified.
  const anonymous = summariseChannel([note({ acknowledged: null })], [], false);
  assert.equal(anonymous.unacknowledged_notes, null);

  const identified = summariseChannel([note({ acknowledged: false })], [], true);
  assert.equal(identified.unacknowledged_notes, 1);

  const caughtUp = summariseChannel([note({ acknowledged: true })], [], true);
  assert.equal(caughtUp.unacknowledged_notes, 0);
});

test('blocking questions are counted separately from open ones', () => {
  const counts = summariseChannel(
    [],
    [question(), question({ id: 'd', kind: 'blocked', blocking: true })],
    true,
  );
  assert.equal(counts.open_questions, 2);
  assert.equal(counts.blocking_questions, 1);
});

test('a quiet channel says nothing at all', () => {
  assert.equal(describeChannelState(summariseChannel([], [], true)), null);
  assert.equal(describeChannelState(null), null);
  assert.equal(describeChannelState(undefined), null);
  // Acknowledged notes are not news either.
  assert.equal(describeChannelState(summariseChannel([note({ acknowledged: true })], [], true)), null);
});

test('the nudge is singular or plural as it should be, and names the blocking count', () => {
  const one = describeChannelState(summariseChannel([note()], [], true));
  assert.equal(one, '1 operator note you have not acknowledged');

  const many = describeChannelState(
    summariseChannel([note(), note({ id: 'b' })], [question({ kind: 'blocked', blocking: true })], true),
  );
  assert.equal(
    many,
    '2 operator notes you have not acknowledged; 1 open question to a human, 1 blocking',
  );
});

test('needs_human defaults to a blocking blocked question', () => {
  const result = validateNeedsHuman({ question: '  Authorize the implementation scope?  ' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, { kind: 'blocked', body: 'Authorize the implementation scope?', blocking: true });
});

test('needs_human keeps an explicit kind and blocking', () => {
  const result = validateNeedsHuman({ question: 'Confirm the fixture?', kind: 'validation', blocking: false });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, { kind: 'validation', body: 'Confirm the fixture?', blocking: false });
});

test('a bad needs_human names the field as the sender wrote it and says nothing was sent', () => {
  const empty = validateNeedsHuman({ question: '   ' });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.match(empty.body.error, /^needs_human\.question cannot be empty/);
    assert.match(empty.body.error, /no turn was spent/);
  }
  const kind = validateNeedsHuman({ question: 'x', kind: 'urgent' });
  assert.equal(kind.ok, false);
  if (!kind.ok) assert.match(kind.body.error, /^needs_human\.kind must be one of/);
  const shape = validateNeedsHuman('Authorize it?');
  assert.equal(shape.ok, false);
  if (!shape.ok) assert.match(shape.body.error, /must be an object/);
});

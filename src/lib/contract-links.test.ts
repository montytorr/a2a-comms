import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_LINK_NOTE_MAX,
  CONTRACT_LINK_TYPES,
  contractLinkTypeHelp,
  describeContractLink,
  isContractLinkType,
  normalizeLinkRow,
  validateLinkRequest,
} from '@/lib/contract-links';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const rejection = (from: string, input: unknown) => {
  const result = validateLinkRequest(from, input);
  assert.equal(result.ok, false, 'expected a rejection');
  if (result.ok) throw new Error('unreachable');
  return result;
};

test('the vocabulary is exactly three types and has no generic relates_to', () => {
  assert.deepEqual([...CONTRACT_LINK_TYPES], ['continues', 'supersedes', 'delegates_to']);
  assert.equal(isContractLinkType('relates_to'), false);
  assert.equal(isContractLinkType('blocks'), false);
  assert.equal(isContractLinkType('continues'), true);
});

test('a valid request keeps the type and trims the note', () => {
  const result = validateLinkRequest(A, {
    to_contract_id: B,
    link_type: 'continues',
    note: '  ran out of turns  ',
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('unreachable');
  assert.deepEqual(result.value, { toContractId: B, linkType: 'continues', note: 'ran out of turns' });
});

test('an omitted or blank note is null, not an empty string', () => {
  for (const note of [undefined, null, '   ']) {
    const result = validateLinkRequest(A, { to_contract_id: B, link_type: 'supersedes', note });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('unreachable');
    assert.equal(result.value.note, null);
  }
});

test('a missing or malformed to_contract_id is refused before any query', () => {
  assert.equal(rejection(A, {}).status, 400);
  assert.equal(rejection(A, { to_contract_id: 'not-a-uuid', link_type: 'continues' }).status, 400);
  assert.equal(rejection(A, { to_contract_id: 42, link_type: 'continues' }).status, 400);
});

test('self-linking is refused with its own code, not a constraint name', () => {
  const refusal = rejection(A, { to_contract_id: A, link_type: 'continues' });
  assert.equal(refusal.body.code, 'CONTRACT_LINK_SELF');
  // The database CHECK catches this too; the point of catching it here is the sentence.
  assert.match(refusal.body.error, /cannot be linked to itself/);
});

test('self-linking is caught whatever the case of the uuid', () => {
  const refusal = rejection(A.toUpperCase(), { to_contract_id: A, link_type: 'continues' });
  assert.equal(refusal.body.code, 'CONTRACT_LINK_SELF');
});

test('an unknown link type names every allowed one and what it means', () => {
  const refusal = rejection(A, { to_contract_id: B, link_type: 'relates_to' });
  assert.equal(refusal.body.code, 'CONTRACT_LINK_TYPE_INVALID');
  for (const type of CONTRACT_LINK_TYPES) {
    assert.ok(refusal.body.error.includes(type) || String(refusal.body.details).includes(type));
    assert.ok(String(refusal.body.details).includes(contractLinkTypeHelp(type)));
  }
});

test('a note longer than the cap is refused and says where the detail belongs', () => {
  const refusal = rejection(A, {
    to_contract_id: B,
    link_type: 'continues',
    note: 'x'.repeat(CONTRACT_LINK_NOTE_MAX + 1),
  });
  assert.equal(refusal.status, 400);
  assert.match(refusal.body.error, /contract description/);
});

test('a note exactly at the cap is accepted', () => {
  const result = validateLinkRequest(A, {
    to_contract_id: B,
    link_type: 'continues',
    note: 'x'.repeat(CONTRACT_LINK_NOTE_MAX),
  });
  assert.equal(result.ok, true);
});

test('every link type reads correctly from both ends', () => {
  assert.equal(describeContractLink('continues', 'outgoing'), 'Continues');
  assert.equal(describeContractLink('continues', 'incoming'), 'Continued by');
  assert.equal(describeContractLink('supersedes', 'outgoing'), 'Supersedes');
  assert.equal(describeContractLink('supersedes', 'incoming'), 'Superseded by');
  assert.equal(describeContractLink('delegates_to', 'outgoing'), 'Delegates to');
  assert.equal(describeContractLink('delegates_to', 'incoming'), 'Delegated from');
});

const row = (overrides: Record<string, unknown> = {}) => ({
  from_contract_id: A,
  to_contract_id: B,
  link_type: 'continues',
  note: null,
  created_at: '2026-09-18T07:00:00.000Z',
  created_by_agent_id: null,
  from_contract: { id: A, title: 'The first one', status: 'closed' },
  to_contract: { id: B, title: 'The second one', status: 'active' },
  ...overrides,
});

test('a row read from the from end is outgoing and describes the far contract', () => {
  const summary = normalizeLinkRow(row(), A);
  assert.deepEqual(summary, {
    contract_id: B,
    title: 'The second one',
    status: 'active',
    link_type: 'continues',
    direction: 'outgoing',
    note: null,
    linked_at: '2026-09-18T07:00:00.000Z',
    linked_by_agent_id: null,
  });
});

test('the same row read from the to end is incoming and points the other way', () => {
  const summary = normalizeLinkRow(row(), B);
  assert.equal(summary?.direction, 'incoming');
  assert.equal(summary?.contract_id, A);
  assert.equal(summary?.title, 'The first one');
});

test('an embed that arrives as a one-element array is handled like an object', () => {
  const summary = normalizeLinkRow(
    row({ to_contract: [{ id: B, title: 'The second one', status: 'active' }] }),
    A
  );
  assert.equal(summary?.title, 'The second one');
});

test('a link whose far contract did not come back is dropped, not rendered untitled', () => {
  assert.equal(normalizeLinkRow(row({ to_contract: null }), A), null);
  assert.equal(normalizeLinkRow(row({ to_contract: { id: B, title: null } }), A), null);
});

test('a link type this build does not know is dropped rather than rendered raw', () => {
  // A row written by a newer migration must not reach the UI as an unlabelled edge.
  assert.equal(normalizeLinkRow(row({ link_type: 'invented_later' }), A), null);
});

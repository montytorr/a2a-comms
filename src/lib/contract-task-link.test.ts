import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLinkedTaskRow, validateLinkFields } from './contract-task-link';

// The facade returns an embed as an object or a one-element array depending on
// the relation; both shapes reach this code and a mishandled one yields a silent
// null, which reads as "contract is not linked" and blocks attachments.
test('normalizeLinkedTaskRow accepts the object embed shape', () => {
  const s = normalizeLinkedTaskRow({
    id: 't1',
    title: 'Build the ingest pipeline',
    status: 'in-progress',
    project_id: 'p1',
    project: { id: 'p1', title: 'Holloway v2.0' },
  });
  assert.deepEqual(s, {
    task_id: 't1',
    task_title: 'Build the ingest pipeline',
    task_status: 'in-progress',
    project_id: 'p1',
    project_title: 'Holloway v2.0',
  });
});

test('normalizeLinkedTaskRow accepts the array embed shape identically', () => {
  const asObject = normalizeLinkedTaskRow({
    id: 't1', title: 'T', status: 'todo', project_id: 'p1', project: { id: 'p1', title: 'P' },
  });
  const asArray = normalizeLinkedTaskRow([
    { id: 't1', title: 'T', status: 'todo', project_id: 'p1', project: [{ id: 'p1', title: 'P' }] },
  ]);
  assert.deepEqual(asArray, asObject, 'both embed shapes must produce the same summary');
});

test('normalizeLinkedTaskRow returns null without a project', () => {
  // A task with no project cannot give the contract a project, which is the
  // only thing the link is for.
  assert.equal(normalizeLinkedTaskRow({ id: 't1', title: 'T', project_id: null }), null);
  assert.equal(normalizeLinkedTaskRow(null), null);
  assert.equal(normalizeLinkedTaskRow(undefined), null);
  assert.equal(normalizeLinkedTaskRow([]), null);
});

test('normalizeLinkedTaskRow returns null without a task id', () => {
  assert.equal(normalizeLinkedTaskRow({ project_id: 'p1' }), null);
});

test('normalizeLinkedTaskRow tolerates a missing project embed', () => {
  // project_id is present but the join did not come back; the link is still
  // real and usable, just unnamed.
  const s = normalizeLinkedTaskRow({ id: 't1', title: 'T', status: 'todo', project_id: 'p1' });
  assert.equal(s?.project_id, 'p1');
  assert.equal(s?.project_title, null);
});

test('validateLinkFields accepts both or neither', () => {
  assert.equal(validateLinkFields(undefined, undefined), null);
  assert.equal(validateLinkFields('p1', 't1'), null);
});

test('validateLinkFields rejects one without the other', () => {
  // Either alone is meaningless: the task identifies the link, the project
  // authorises it.
  assert.ok(validateLinkFields('p1', undefined));
  assert.ok(validateLinkFields(undefined, 't1'));
  assert.match(validateLinkFields('p1', undefined) || '', /must be provided together/);
});

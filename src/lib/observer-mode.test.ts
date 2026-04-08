import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeObserverCommentType,
  isObserverCommentTypeAllowed,
  buildObserverCommentMetadata,
  participantDescriptor,
} from './observer-mode';

test('observer comment types normalize to safe read-only values', () => {
  assert.equal(normalizeObserverCommentType('analysis'), 'analysis');
  assert.equal(normalizeObserverCommentType('comment'), 'comment');
  assert.equal(normalizeObserverCommentType('status_change'), 'comment');
  assert.equal(normalizeObserverCommentType(undefined), 'comment');
});

test('observer comment type allowlist only accepts commentary and analysis', () => {
  assert.equal(isObserverCommentTypeAllowed('comment'), true);
  assert.equal(isObserverCommentTypeAllowed('analysis'), true);
  assert.equal(isObserverCommentTypeAllowed(undefined), true);
  assert.equal(isObserverCommentTypeAllowed('assignment'), false);
  assert.equal(isObserverCommentTypeAllowed('system'), false);
});

test('observer comment metadata stamps read-only flags without dropping caller metadata', () => {
  assert.deepEqual(buildObserverCommentMetadata({ foo: 'bar' }), {
    foo: 'bar',
    observer_note: true,
    observer_read_only: true,
  });
});

test('participant descriptor clearly distinguishes read-only observer from execution roles', () => {
  assert.equal(participantDescriptor({ role: 'observer', accessKind: 'observer' }), 'read-only observer');
  assert.equal(
    participantDescriptor({ participantRole: 'invitee', participantStatus: 'accepted' }),
    'invitee · accepted'
  );
});

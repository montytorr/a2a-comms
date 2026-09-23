import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGE_STRUCTURE_THRESHOLD, validateMessageStructure } from '@/lib/message-structure';
import { DESCRIPTION_STRUCTURE_THRESHOLD } from '@/lib/contract-description';
import { TURN_10 } from '@/lib/fixtures/contract-64345e47';

const wall = 'At exact reviewed SHA b16cd956, I accept the P1 fixture and P2 workload findings as blockers. '.repeat(8);

test('a long single-paragraph message is refused and shown the shape to use', () => {
  const check = validateMessageStructure({ text: wall });
  assert.equal(check.ok, false);
  if (check.ok) return;
  assert.equal(check.body.code, 'MESSAGE_UNSTRUCTURED');
  assert.match(check.body.error, /no turn was spent/);
  assert.match(check.body.error, /--content @reply\.md/);
  assert.match(check.body.error, /\*\*Next:\*\*/);
});

test('messages get a lower limit than descriptions: 400, not 600', () => {
  assert.equal(MESSAGE_STRUCTURE_THRESHOLD, 400);
  assert.equal(DESCRIPTION_STRUCTURE_THRESHOLD, 600);
  assert.equal(validateMessageStructure({ text: 'x'.repeat(400) }).ok, true);
  const over = validateMessageStructure({ text: 'x'.repeat(401) });
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.body.error, /Over 400/);
});

test('the 555-character single paragraph from contract 64345e47 turn 10 is refused', () => {
  assert.ok(TURN_10.length > 400 && TURN_10.length < 600, 'legal under the old rule, refused under the new one');
  const check = validateMessageStructure({ text: TURN_10 });
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.body.code, 'MESSAGE_UNSTRUCTURED');
});

test('every body key the dashboard renders is checked, not only text', () => {
  for (const key of ['text', 'markdown', 'message', 'summary']) {
    assert.equal(validateMessageStructure({ [key]: wall }).ok, false, key);
  }
});

test('structured Markdown, short one-liners and structured payloads pass', () => {
  assert.equal(validateMessageStructure({ markdown: `## Review\n\n${wall}` }).ok, true);
  assert.equal(validateMessageStructure({ text: 'Received, reviewing now.' }).ok, true);
  assert.equal(validateMessageStructure({ payload: { status: 'ok', note: wall } }).ok, true);
});

test('a literal backslash-n is refused, but not inside a code span', () => {
  const escaped = validateMessageStructure({ text: '## Update\\n\\n- done' });
  assert.equal(escaped.ok, false);
  if (!escaped.ok) assert.equal(escaped.body.code, 'MESSAGE_ESCAPED_BREAKS');
  assert.equal(validateMessageStructure({ text: 'Use `\\n` in the heredoc.' }).ok, true);
});

test('the messages route checks structure before the turn cap, and only for turn messages', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/v1/contracts/[id]/messages/route.ts'), 'utf8');
  const structure = route.indexOf('validateMessageStructure(parsed.content)');
  assert.ok(structure > 0);
  assert.ok(structure < route.indexOf("code: 'MAX_TURNS'"), 'a refused message must never cost a turn');
  assert.match(route.slice(structure - 200, structure), /if \(!isNonTurn\)/);
});

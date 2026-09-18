import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESCRIPTION_STRUCTURE_THRESHOLD,
  hasEscapedBreakOutsideCode,
  validateContractDescription,
} from '@/lib/contract-description';

/** Prose of an exact length, with no trailing space for trim() to remove. */
const long = (n: number) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n).trimEnd().padEnd(n, 'x');

const rejection = (input: unknown) => {
  const result = validateContractDescription(input);
  assert.equal(result.ok, false, 'expected a rejection');
  if (result.ok) throw new Error('unreachable');
  return result;
};

test('absent, null and blank all mean no description', () => {
  assert.deepEqual(validateContractDescription(undefined), { ok: true, value: null });
  assert.deepEqual(validateContractDescription(null), { ok: true, value: null });
  assert.deepEqual(validateContractDescription('   \n  '), { ok: true, value: null });
});

test('surrounding whitespace is trimmed', () => {
  assert.deepEqual(validateContractDescription('  hello  '), { ok: true, value: 'hello' });
});

test('a non-string is rejected', () => {
  assert.equal(rejection(42).body.code, 'CONTRACT_DESCRIPTION_INVALID');
});

test('a short single line is still a perfectly good description', () => {
  const value = long(DESCRIPTION_STRUCTURE_THRESHOLD);
  assert.deepEqual(validateContractDescription(value), { ok: true, value });
});

test('a long description with no line break is rejected, and told how to fix it', () => {
  const result = rejection(long(DESCRIPTION_STRUCTURE_THRESHOLD + 1));
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'CONTRACT_DESCRIPTION_UNSTRUCTURED');
  // The remedy belongs in the message: an agent with no next step invents one.
  assert.ok(result.body.error.includes('--description @brief.md'));
});

test('the same text is accepted once it carries structure', () => {
  const value = `## Scope\n\n- ${long(400)}\n- ${long(400)}`;
  assert.deepEqual(validateContractDescription(value), { ok: true, value });
});

test('a literal backslash-n is rejected', () => {
  assert.equal(
    rejection('## Scope\\n\\n- one\\n- two').body.code,
    'CONTRACT_DESCRIPTION_ESCAPED_BREAKS'
  );
});

test('a literal backslash-r-backslash-n is rejected', () => {
  assert.equal(
    rejection('Line one\\r\\nLine two').body.code,
    'CONTRACT_DESCRIPTION_ESCAPED_BREAKS'
  );
});

test('a description may document the escape inside a code span', () => {
  const value = 'Pass real newlines; a shell `\\n` is stored as text.';
  assert.deepEqual(validateContractDescription(value), { ok: true, value });
});

test('a description may document the escape inside a fenced block', () => {
  const value = 'Example:\n\n```\nprintf "a\\nb"\n```';
  assert.deepEqual(validateContractDescription(value), { ok: true, value });
});

test('the contract that motivated this is rejected: 1901 characters on one line', () => {
  assert.equal(rejection(long(1901)).body.code, 'CONTRACT_DESCRIPTION_UNSTRUCTURED');
});

test('an unterminated code span is not scanned past', () => {
  assert.equal(hasEscapedBreakOutsideCode('text ` unterminated \\n'), false);
});

test('an escape after a closed code span is still found', () => {
  assert.equal(hasEscapedBreakOutsideCode('`ok` then \\n here'), true);
});

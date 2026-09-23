import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The contracts list showed how OLD each contract was and never how long it had
 * left — the least urgent fact available, in the one column that could have
 * carried a deadline. `expires_at` was returned by the query and rendered
 * nowhere.
 *
 * describeExpiry lives in the page file because it is page presentation, so
 * this checks its rules against the source rather than importing a server
 * component.
 */
const page = readFileSync(join(process.cwd(), 'src/app/(dashboard)/contracts/(list)/page.tsx'), 'utf8');

test('only a contract that can still expire gets a countdown', () => {
  const fn = page.slice(page.indexOf('function describeExpiry'), page.indexOf('export default async function'));
  assert.match(fn, /\['proposed', 'active'\]/,
    'a closed or expired contract has a date in the past, which is history rather than a deadline');
  assert.match(fn, /return null/);
});

test('the countdown escalates, and only the last day counts as soon', () => {
  const fn = page.slice(page.indexOf('function describeExpiry'), page.indexOf('export default async function'));
  // Under an hour, under a day, then days — each with the right urgency.
  assert.match(fn, /hours < 1[\s\S]*?m left`, soon: true/);
  assert.match(fn, /hours < 24[\s\S]*?h left`, soon: true/);
  assert.match(fn, /d left`, soon: false/);
  assert.match(fn, /msLeft <= 0[\s\S]*?overdue/);
});

test('an agent waiting on a person is visible without opening the contract', () => {
  assert.match(page, /open_questions \?\? 0\) > 0/,
    'the list must surface an open question — it is the most actionable state a row can be in');
  assert.match(page, /getOperatorChannelForContracts/);
});

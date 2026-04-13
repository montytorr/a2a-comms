import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

test('reputation feedback route exports POST handler', async () => {
  const { POST } = await import('@/app/api/v1/agents/[id]/reputation-feedback/route');
  assert.equal(typeof POST, 'function');
});

test('reputation feedback route keeps admin-only gate ahead of body parsing and writes', () => {
  const route = read('src/app/api/v1/agents/[id]/reputation-feedback/route.ts');

  assert.match(route, /if \(!isAdminAgent\(auth\.agent\.id, auth\.agent\.name\)\) \{/);
  assert.match(route, /Only admin agents may submit operator reputation feedback/);
  assert.match(route, /let parsed: OperatorFeedbackInput;/);

  const adminGate = route.indexOf("if (!isAdminAgent(auth.agent.id, auth.agent.name)) {");
  const parseBody = route.indexOf('parsed = JSON.parse(body);');
  const writeLedger = route.indexOf('await recordOperatorFeedback({');

  assert.ok(adminGate >= 0, 'admin gate missing');
  assert.ok(parseBody > adminGate, 'body parsing should happen after admin gate');
  assert.ok(writeLedger > adminGate, 'ledger write should happen after admin gate');
});

test('reputation feedback route validates score, summary, metadata, and linkage before recording feedback', () => {
  const route = read('src/app/api/v1/agents/[id]/reputation-feedback/route.ts');

  assert.match(route, /score must be a number between -1 and 1/);
  assert.match(route, /summary is required and must be 1-\$\{MAX_SUMMARY_LENGTH\} characters/);
  assert.match(route, /notes must be \$\{MAX_NOTES_LENGTH\} characters or fewer/);
  assert.match(route, /review_label must be one of:/);
  assert.match(route, /metadata must be a plain object/);
  assert.match(route, /metadata keys must be 64 characters or fewer and values must be JSON primitives/);
  assert.match(route, /related_project_id is required when related_task_id is provided/);
  assert.match(route, /related_task_id does not belong to related_project_id/);
  assert.match(route, /related_contract_id is not linked to related_task_id/);
  assert.match(route, /score,\s*summary: normalizedSummary,\s*notes: normalizedNotes,\s*review_label: reviewLabel,\s*metadata,/);
});

test('reputation feedback route only appends task activity after verified task linkage', () => {
  const route = read('src/app/api/v1/agents/[id]/reputation-feedback/route.ts');

  assert.match(route, /let linkedTask: \{ id: string; project_id: string \} \| null = null;/);
  assert.match(route, /if \(relatedTaskId\) \{/);
  assert.match(route, /projectId: linkedTask\.project_id/);
  assert.match(route, /taskId: linkedTask\.id/);
  assert.doesNotMatch(route, /projectId: parsed\.related_project_id/);
  assert.doesNotMatch(route, /taskId: parsed\.related_task_id/);
});

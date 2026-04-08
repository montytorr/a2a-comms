import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

test('generic contract dashboard panel exposes first-class observer selection', () => {
  const panel = read('src/app/(dashboard)/contracts/propose-contract-panel.tsx');

  assert.match(panel, /const \[observers, setObservers\] = useState<string\[]>\(\[\]\)/);
  assert.match(panel, /formData\.set\('observers', JSON\.stringify\(observers\)\)/);
  assert.match(panel, /<p className="text-\[11px\] font-semibold text-white">Observers<\/p>/);
  assert.match(panel, /Read-only from the start\./);
  assert.match(panel, /Observers: <span className="text-cyan-200">\{observers\.join\(', '\) \|\| '—'\}<\/span>/);
});

test('shared contract proposal logic persists observers and enforces observer-specific boundaries', () => {
  const proposals = read('src/lib/contract-proposals.ts');

  assert.match(proposals, /const normalizedObservers = Array\.from\(/);
  assert.match(proposals, /unknown observer\(s\): \$\{missingObservers\.join\(', '\)\}/);
  assert.match(proposals, /Cannot add yourself as an invitee or observer on the same contract/);
  assert.match(proposals, /Agents cannot be both invitees and observers on the same contract/);
  assert.match(proposals, /evaluateContractCollaboration\(actor, inviteeAgents, observerAgents\)/);
  assert.match(proposals, /role: 'observer' as const/);
  assert.match(proposals, /observers: normalizedObservers/);
});

test('contract routes keep observer boundaries explicit at the API layer', () => {
  const contractsRoute = read('src/app/api/v1/contracts/route.ts');
  const messagesRoute = read('src/app/api/v1/contracts/[id]/messages/route.ts');
  const trustPolicy = read('src/lib/contract-trust-policy.ts');

  assert.match(contractsRoute, /const proposal = await createContractProposal\(/);
  assert.match(contractsRoute, /if \(error instanceof ContractProposalError\)/);
  assert.match(messagesRoute, /evaluateContractParticipantMutation\('send-message', participant\)/);
  assert.match(trustPolicy, /Observers may inspect contract context but cannot send messages/);
  assert.match(trustPolicy, /Observers may inspect contract context but cannot accept contracts/);
  assert.match(trustPolicy, /Observers may inspect contract context but cannot reject contracts/);
  assert.match(trustPolicy, /Observers may inspect contract context but cannot cancel contracts/);
});

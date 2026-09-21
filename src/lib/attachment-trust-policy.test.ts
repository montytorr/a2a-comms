import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateAttachmentDownloadAccess } from './attachment-trust-policy';
import type { ProjectAccessRecord } from './project-access';

const memberAccess: ProjectAccessRecord = {
  projectId: 'p1',
  agentId: 'a1',
  role: 'member',
  accessKind: 'membership',
  isWriteAllowed: true,
};

const observerAccess: ProjectAccessRecord = {
  projectId: 'p1',
  agentId: 'a2',
  role: 'observer',
  accessKind: 'observer',
  isWriteAllowed: false,
};

test('members can download attachments regardless of trust tier', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess({ trust_tier: 'external' }, memberAccess, { contract_id: null }),
    { allowed: true, status: 200 }
  );
});

test('partner observers can download project-only attachments', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess(
      { trust_tier: 'partner', trust_policy: { observer_project_access: { read: 'partner', download_project_attachments: 'partner' } } },
      observerAccess,
      { contract_id: null }
    ),
    { allowed: true, status: 200 }
  );
});

test('external observers are blocked from project-only attachment downloads when observer reads require partner', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess(
      { trust_tier: 'external', trust_policy: { observer_project_access: { read: 'partner', download_project_attachments: 'partner' } } },
      observerAccess,
      { contract_id: null }
    ),
    {
      allowed: false,
      status: 403,
      body: {
        error: 'Observer project read access requires partner-tier trust. This agent is external-tier.',
        code: 'TRUST_TIER_BLOCKED',
      },
    }
  );
});

test('observer attachment downloads can remain stricter than read visibility', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess(
      { trust_tier: 'partner', trust_policy: { observer_project_access: { read: 'external', download_project_attachments: 'internal' } } },
      observerAccess,
      { contract_id: null }
    ),
    {
      allowed: false,
      status: 403,
      body: {
        error: 'Observer project attachment downloads require internal-tier trust. This agent is partner-tier.',
        code: 'TRUST_TIER_BLOCKED',
      },
    }
  );
});

test('external observers can still download attachments scoped to a contract when observer reads allow external', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess(
      { trust_tier: 'external', trust_policy: { observer_project_access: { read: 'external', download_project_attachments: 'internal' } } },
      observerAccess,
      { contract_id: 'c1' }
    ),
    { allowed: true, status: 200 }
  );
});

test('missing project access is denied before trust-tier checks', () => {
  assert.deepEqual(
    evaluateAttachmentDownloadAccess({ trust_tier: 'internal' }, null, { contract_id: 'c1' }),
    {
      allowed: false,
      status: 403,
      body: { error: 'Forbidden', code: 'FORBIDDEN' },
    }
  );
});

// Regression: `verifyContractParticipation` selected `status` and never read
// it, so an agent that had REJECTED a contract invitation still counted as a
// participant and could download that contract's attachments. Declining must
// not be a cheaper way to keep reading. Asserted against the source because the
// lookup is a database query with no seam to inject.
test('contract participation for attachment access is limited to accepted participants', () => {
  const source = readFileSync(new URL('./attachment-access.ts', import.meta.url), 'utf8');
  const lookup = source.slice(source.indexOf('export async function verifyContractParticipation'));
  const body = lookup.slice(0, lookup.indexOf('\n}'));
  assert.match(body, /\.eq\('status', 'accepted'\)/);
});

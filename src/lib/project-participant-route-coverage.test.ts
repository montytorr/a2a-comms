import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

test('observer management routes require real membership and owner role before mutating observers', () => {
  const observersRoute = read('src/app/api/v1/projects/[id]/observers/route.ts');
  const observerRoute = read('src/app/api/v1/projects/[id]/observers/[observerId]/route.ts');

  assert.match(observersRoute, /if \(!member\) \{/);
  assert.match(observersRoute, /Only project owners can manage observers/);
  assert.doesNotMatch(observersRoute, /!member \|\| member\.role !== 'owner'/);

  assert.match(observerRoute, /if \(!member\) \{/);
  assert.match(observerRoute, /Only project owners can manage observers/);
  assert.doesNotMatch(observerRoute, /!member \|\| member\.role !== 'owner'/);
});

test('project invitation routes distinguish participant visibility from owner-only invitation control', () => {
  const invitationsRoute = read('src/app/api/v1/projects/[id]/invitations/route.ts');
  const invitationRoute = read('src/app/api/v1/projects/[id]/invitations/[invitationId]/route.ts');

  assert.match(invitationsRoute, /if \(!member\) \{/);
  assert.match(invitationsRoute, /if \(member\.role !== 'owner'\) \{/);
  assert.match(invitationsRoute, /Not a participant in this project/);
  assert.match(invitationsRoute, /Only project owners can invite members/);

  assert.match(invitationRoute, /const callerMembership = await getProjectMembership\(id, auth\.agent\.id\);/);
  assert.match(invitationRoute, /const isOwner = !!callerMembership && callerMembership\.role === 'owner';/);
  assert.match(invitationRoute, /Only project owners or the original inviter can cancel invitations/);
});

test('project members route keeps observer reads open while rejecting observer mutations', () => {
  const membersRoute = read('src/app/api/v1/projects/[id]/members/route.ts');

  assert.match(membersRoute, /Not a participant in this project/);
  assert.match(membersRoute, /if \(!callerMember\) \{/);
  assert.match(membersRoute, /if \(callerMember\.accessKind === 'observer'\) \{/);
  assert.match(membersRoute, /Observers may inspect project members but cannot invite new ones directly/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

test('project listing includes observer-visible projects', () => {
  const route = read('src/app/api/v1/projects/route.ts');
  const access = read('src/lib/project-access.ts');

  assert.match(access, /export async function listObservedProjectIds\(agentId: string\): Promise<string\[]>/);
  assert.match(route, /listObservedProjectIds\(auth\.agent\.id\)/);
  assert.match(route, /const projectIds = Array\.from\(new Set\(\[/);
});

test('dashboard project list applies caller-aware observer invitation visibility summaries', () => {
  const dashboardPage = read('src/app/(dashboard)/projects/page.tsx');
  const authContext = read('src/lib/auth-context.ts');
  const projectCardAccess = read('src/lib/project-card-access.ts');

  assert.match(authContext, /trustTier: 'internal' \| 'partner' \| 'external'/);
  assert.match(authContext, /trustPolicy: ReturnType<typeof normalizeAgentTrustPolicy>/);
  assert.match(authContext, /selectLeastPrivilegeTier/);
  assert.match(authContext, /buildLeastPrivilegeTrustPolicy/);
  assert.match(projectCardAccess, /export function buildProjectCardAccessMap/);
  assert.match(projectCardAccess, /treatInvitationsAsObserverSummary: mode === 'observer'/);
  assert.match(projectCardAccess, /canSeeParticipantCounts: mode !== 'observer'/);
  assert.match(dashboardPage, /projectAccessById/);
  assert.match(dashboardPage, /const access = projectAccessById\[project\.id\]/);
  assert.match(dashboardPage, /treatAsObserver: access\?\.treatInvitationsAsObserverSummary \?\? false/);
  assert.match(dashboardPage, /access\?\.canSeeParticipantCounts !== false/);
  assert.match(dashboardPage, /Restricted invitation summary/);
});

test('project detail exposes observer-aware visibility without granting invitation management', () => {
  const route = read('src/app/api/v1/projects/[id]/route.ts');

  assert.match(route, /\{ error: 'Not a participant in this project', code: 'FORBIDDEN' \}/);
  assert.match(route, /evaluateObserverProjectReadPolicyAccess\(auth\.agent\)/);
  assert.match(route, /applyProjectInvitationVisibility\(hydratedInvitations, auth\.agent/);
  assert.match(route, /pending_hidden_count: invitationVisibility\.hiddenPendingCount/);
  assert.match(route, /observers: observersRes\.data \|\| \[\]/);
});

test('task and sprint visibility routes allow observers to read but block mutations explicitly', () => {
  const tasksRoute = read('src/app/api/v1/projects/[id]/tasks/route.ts');
  const depsRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/dependencies/route.ts');
  const contractsRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/contracts/route.ts');
  const runsRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/runs/route.ts');
  const runRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/runs/[rid]/route.ts');
  const checkpointsRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/runs/[rid]/checkpoints/route.ts');
  const attachmentsRoute = read('src/app/api/v1/projects/[id]/tasks/[tid]/attachments/route.ts');
  const sprintsRoute = read('src/app/api/v1/projects/[id]/sprints/route.ts');
  const sprintRoute = read('src/app/api/v1/projects/[id]/sprints/[sid]/route.ts');

  assert.match(tasksRoute, /return getProjectAccess\(projectId, agentId\);/);
  assert.match(tasksRoute, /Observers may inspect project tasks but cannot create new ones/);
  assert.match(depsRoute, /Observers may inspect task dependencies but cannot edit them/);
  assert.match(contractsRoute, /Observers may inspect linked contracts but cannot change task-contract links/);
  assert.match(runsRoute, /getProjectAccess\(projectId, auth\.agent\.id\)/);
  assert.match(runsRoute, /evaluateObserverProjectReadPolicyAccess\(auth\.agent\)/);
  assert.match(runsRoute, /Observers may inspect runs but cannot start execution/);
  assert.match(runRoute, /getProjectAccess\(projectId, auth\.agent\.id\)/);
  assert.match(runRoute, /evaluateObserverProjectReadPolicyAccess\(auth\.agent\)/);
  assert.match(runRoute, /Observers may inspect runs but cannot mutate execution state/);
  assert.match(checkpointsRoute, /getProjectAccess\(projectId, auth\.agent\.id\)/);
  assert.match(checkpointsRoute, /evaluateObserverProjectReadPolicyAccess\(auth\.agent\)/);
  assert.match(checkpointsRoute, /Observers may inspect checkpoints but cannot append to execution streams/);
  assert.match(attachmentsRoute, /evaluateAttachmentDownloadAccess\(auth\.agent, member, \{ contract_id: null \}\)/);
  assert.match(sprintsRoute, /Observers may inspect sprints but cannot create them/);
  assert.match(sprintRoute, /Observers may inspect sprints but cannot update them/);
});

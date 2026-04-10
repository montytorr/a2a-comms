import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relPath: string) {
  return readFileSync(path.join(root, relPath), 'utf8');
}

test('project and contract dashboard actions use acting-agent aware auth helpers', () => {
  const projectActions = read('src/app/(dashboard)/projects/[id]/actions.ts');
  const taskActions = read('src/app/(dashboard)/projects/[id]/tasks/[tid]/actions.ts');
  const contractActions = read('src/app/(dashboard)/contracts/[id]/actions.ts');

  assert.match(projectActions, /import \{ getAuthActorContext \} from '@\/lib\/auth-actor-context';/);
  assert.match(projectActions, /return resolveProjectActorAccess\(auth, projectId, options\);/);
  assert.match(projectActions, /const inviterAgentId = user\.memberAgentId \|\| auth\.actingAgentId;/);
  assert.match(projectActions, /const isInvitee = auth\.agentScope\.includes\(invitation\.agent_id\);/);
  assert.match(projectActions, /export async function addProjectObserver\(projectId: string, agentId: string, note\?: string \| null\)/);
  assert.match(projectActions, /await requireProjectMembership\(projectId, \{ requireRole: 'owner' \}\);/);
  assert.match(projectActions, /export async function updateProjectObserver\(projectId: string, observerId: string, note\?: string \| null\)/);
  assert.match(projectActions, /export async function removeProjectObserver\(projectId: string, observerId: string\)/);

  assert.match(taskActions, /return resolveProjectActorAccess\(auth, projectId, options\);/);
  assert.match(taskActions, /actor_agent_id: user\.memberAgentId \?\? null/);
  assert.match(taskActions, /participant_access_kind: user\.accessKind/);

  assert.match(contractActions, /const agentScope = auth\.agentScope\.length > 0 \? auth\.agentScope : \[EMPTY_UUID\];/);
  assert.match(contractActions, /uploader_agent_id: participation\?\.\[0\]\?\.agent_id \|\| auth\.actingAgentId \|\| null/);
  assert.match(contractActions, /actor_agent_id: auth\.actingAgentId \|\| null/);
});

test('dashboard pages scope visibility with acting-agent agentScope', () => {
  const analyticsPage = read('src/app/(dashboard)/analytics/page.tsx');
  const messagesPage = read('src/app/(dashboard)/messages/page.tsx');
  const projectPage = read('src/app/(dashboard)/projects/[id]/page.tsx');
  const projectIndexPage = read('src/app/(dashboard)/projects/page.tsx');
  const taskPage = read('src/app/(dashboard)/projects/[id]/tasks/[tid]/page.tsx');
  const contractPage = read('src/app/(dashboard)/contracts/[id]/page.tsx');
  const contractActions = read('src/app/(dashboard)/contracts/actions.ts');
  const dashboardHome = read('src/app/(dashboard)/page.tsx');
  const webhookHealthPage = read('src/app/(dashboard)/webhooks/health/page.tsx');
  const feedPage = read('src/app/(dashboard)/feed/page.tsx');
  const auditPage = read('src/app/(dashboard)/audit/page.tsx');
  const approvalsPage = read('src/app/(dashboard)/approvals/page.tsx');
  const inspectorPage = read('src/app/(dashboard)/protocol-inspector/page.tsx');

  assert.match(analyticsPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(analyticsPage, /const safeAgentIds = auth\.agentScope;/);
  assert.match(analyticsPage, /const allWebhookAgentIds = new Set\(auth\.agentScope\);/);

  assert.match(messagesPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(messagesPage, /\.in\('agent_id', auth\.agentScope\)/);

  assert.match(projectPage, /\.in\('agent_id', auth\.agentScope\)/);
  assert.match(projectPage, /auth\.agentScope\.includes\(inv\.agent_id\)/);

  assert.match(projectIndexPage, /categorizeProjectInvitations\(visibleInviteRows, auth\.agentScope\)/);

  assert.match(taskPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(taskPage, /const agentScope = auth\.agentScope;/);

  assert.match(contractPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(contractPage, /\.in\('agent_id', auth\.agentScope\)/);
  assert.match(contractPage, /auth\.agentScope\.includes\(participant\.agent\?\.id \|\| ''\)/);
  assert.match(contractActions, /const auth = await getAuthActorContext\(\);/);
  assert.match(contractActions, /!user\.isSuperAdmin && !auth\.agentScope\.includes\(proposerAgentId\)/);

  assert.match(feedPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(feedPage, /buildDashboardVisibilityScope\(auth\)/);
  assert.match(feedPage, /agentIds=\{scope\.agentIds\}/);

  assert.match(auditPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(auditPage, /buildDashboardVisibilityScope\(auth\)/);
  assert.match(auditPage, /scope\?\.contractActorNames/);

  assert.match(dashboardHome, /const auth = await getAuthActorContext\(\);/);
  assert.match(dashboardHome, /const scope = await buildDashboardVisibilityScope\(auth\);/);
  assert.match(dashboardHome, /const contractIds = scope\.contractIds;/);
  assert.match(dashboardHome, /scopedProjectIds = scope\.projectIds;/);
  assert.match(dashboardHome, /const names = scope\.contractActorNames;/);
  assert.match(dashboardHome, /scope\.webhookIds\.length > 0/);

  assert.match(webhookHealthPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(webhookHealthPage, /const scope = await buildDashboardVisibilityScope\(auth\);/);
  assert.match(webhookHealthPage, /const userWebhookIds: string\[\] = !isSuperAdmin \? scope\.webhookIds : \[\];/);

  assert.match(approvalsPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(approvalsPage, /getDashboardApprovalVisibility\(auth\)/);
  assert.match(approvalsPage, /visibility\.allowedApprovalIds/);

  assert.match(inspectorPage, /const auth = await getAuthActorContext\(\);/);
  assert.match(inspectorPage, /agentIds: auth\.agentScope/);
});

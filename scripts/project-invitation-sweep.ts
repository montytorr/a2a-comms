#!/usr/bin/env node
/**
 * Background project invitation sweep.
 * Reconciles pending project invitations without requiring a dashboard/API read:
 * - sends one-shot reminders once they cross the threshold
 * - expires invitations once TTL elapses
 *
 * Run: node --import tsx scripts/project-invitation-sweep.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   PROJECT_INVITATION_SWEEP_INTERVAL_MS=600000
 *   PROJECT_INVITATION_SWEEP_BATCH_SIZE=100
 *   PROJECT_INVITATION_SWEEP_ONCE=1
 *   PROJECT_INVITATION_SWEEP_DRY_RUN=1
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  getProjectInvitationExpiry,
  isProjectInvitationExpired,
  isProjectInvitationReminderDue,
  notifyProjectInvitationReminder,
  notifyProjectInvitationResponded,
  sendProjectMemberInvitationEmail,
} from '../src/lib/project-invitations';
import { getUserEmail } from '../src/lib/email/helpers';
import {
  getProjectInvitationSweepBatchSize,
  getProjectInvitationSweepIntervalMs,
  getProjectInvitationSweepRunMode,
} from '../src/lib/project-invitation-worker-config';

const POLL_INTERVAL_MS = getProjectInvitationSweepIntervalMs();
const BATCH_SIZE = getProjectInvitationSweepBatchSize();
const RUN_ONCE = getProjectInvitationSweepRunMode() === 'once';
const DRY_RUN = process.env.PROJECT_INVITATION_SWEEP_DRY_RUN === '1';

type PendingInvitation = {
  id: string;
  project_id: string;
  agent_id: string;
  invited_by_agent_id: string;
  role: 'owner' | 'member';
  status: 'pending';
  created_at: string;
  updated_at?: string | null;
  expires_at?: string | null;
  reminder_sent_at?: string | null;
  responded_at?: string | null;
  project?: { id: string; title: string } | { id: string; title: string }[] | null;
  agent?: { id: string; name: string; display_name: string; owner_user_id?: string | null } | { id: string; name: string; display_name: string; owner_user_id?: string | null }[] | null;
  invited_by?: { id: string; name: string; display_name: string } | { id: string; name: string; display_name: string }[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`[${ts()}] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let stopping = false;
let timer: NodeJS.Timeout | null = null;

function ts() {
  return new Date().toISOString();
}

function log(msg: string, meta?: Record<string, unknown>) {
  const line = `[${ts()}] ${msg}`;
  if (meta) {
    console.log(line, JSON.stringify(meta));
    return;
  }
  console.log(line);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
}

async function fetchPendingInvitations(client: SupabaseClient): Promise<PendingInvitation[]> {
  const { data, error } = await client
    .from('project_member_invitations')
    .select(`
      id,
      project_id,
      agent_id,
      invited_by_agent_id,
      role,
      status,
      created_at,
      updated_at,
      expires_at,
      reminder_sent_at,
      responded_at,
      project:projects(id, title),
      agent:agents(id, name, display_name, owner_user_id),
      invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw error;
  return (data || []) as PendingInvitation[];
}

async function markExpired(client: SupabaseClient, invitation: PendingInvitation): Promise<'expired' | 'noop'> {
  const now = new Date().toISOString();
  if (DRY_RUN) {
    log('Would expire invitation', { invitationId: invitation.id, projectId: invitation.project_id, agentId: invitation.agent_id });
    return 'expired';
  }

  const { data: updatedInvitation, error } = await client
    .from('project_member_invitations')
    .update({
      status: 'expired',
      responded_at: now,
      updated_at: now,
    })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .select(`
      id,
      project_id,
      agent_id,
      invited_by_agent_id,
      role,
      status,
      created_at,
      updated_at,
      expires_at,
      reminder_sent_at,
      responded_at,
      project:projects(id, title),
      agent:agents(id, name, display_name, owner_user_id),
      invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)
    `)
    .single();

  if (error || !updatedInvitation) {
    log('Expire skipped — invitation changed concurrently', { invitationId: invitation.id, error: error?.message });
    return 'noop';
  }

  const project = firstRelation(updatedInvitation.project);
  const agent = firstRelation(updatedInvitation.agent);
  const invitedBy = firstRelation(updatedInvitation.invited_by);

  await notifyProjectInvitationResponded({
    projectId: updatedInvitation.project_id,
    projectTitle: project?.title || 'Unknown Project',
    invitedAgentId: updatedInvitation.agent_id,
    invitedAgentName: agent?.display_name || agent?.name || 'Unknown Agent',
    invitedByAgentId: updatedInvitation.invited_by_agent_id,
    invitedByName: invitedBy?.display_name || invitedBy?.name || 'Unknown Agent',
    status: 'expired',
  }).catch((err) => {
    log('Expire notification failed', { invitationId: invitation.id, error: err instanceof Error ? err.message : String(err) });
  });

  log('Expired invitation', { invitationId: invitation.id, projectId: invitation.project_id, agentId: invitation.agent_id });
  return 'expired';
}

async function markReminderSent(client: SupabaseClient, invitation: PendingInvitation): Promise<'reminded' | 'noop'> {
  const now = new Date().toISOString();
  const expiresAt = invitation.expires_at || getProjectInvitationExpiry(invitation.created_at);

  if (DRY_RUN) {
    log('Would send invitation reminder', {
      invitationId: invitation.id,
      projectId: invitation.project_id,
      agentId: invitation.agent_id,
      expiresAt,
    });
    return 'reminded';
  }

  const { data: updatedInvitation, error } = await client
    .from('project_member_invitations')
    .update({ reminder_sent_at: now, updated_at: now })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .select(`
      id,
      project_id,
      agent_id,
      invited_by_agent_id,
      role,
      status,
      created_at,
      updated_at,
      expires_at,
      reminder_sent_at,
      responded_at,
      project:projects(id, title),
      agent:agents(id, name, display_name, owner_user_id),
      invited_by:agents!project_member_invitations_invited_by_agent_id_fkey(id, name, display_name)
    `)
    .single();

  if (error || !updatedInvitation) {
    log('Reminder skipped — invitation changed concurrently', { invitationId: invitation.id, error: error?.message });
    return 'noop';
  }

  const project = firstRelation(updatedInvitation.project);
  const agent = firstRelation(updatedInvitation.agent);
  const invitedBy = firstRelation(updatedInvitation.invited_by);

  await notifyProjectInvitationReminder({
    projectId: updatedInvitation.project_id,
    projectTitle: project?.title || 'Unknown Project',
    invitedAgentId: updatedInvitation.agent_id,
    invitedAgentName: agent?.display_name || agent?.name || 'Unknown Agent',
    invitedByAgentId: updatedInvitation.invited_by_agent_id,
    invitedByName: invitedBy?.display_name || invitedBy?.name || 'Unknown Agent',
    invitationId: updatedInvitation.id,
    expiresAt,
  }).catch((err) => {
    log('Reminder webhook failed', { invitationId: invitation.id, error: err instanceof Error ? err.message : String(err) });
  });

  const ownerUserId = agent?.owner_user_id;
  if (ownerUserId) {
    const email = await getUserEmail(ownerUserId).catch(() => null);
    if (email) {
      await sendProjectMemberInvitationEmail({
        to: email,
        userId: ownerUserId,
        projectTitle: project?.title || 'Unknown Project',
        inviterName: invitedBy?.display_name || invitedBy?.name || 'Unknown Agent',
        projectId: updatedInvitation.project_id,
      }).catch((err) => {
        log('Reminder email failed', { invitationId: invitation.id, error: err instanceof Error ? err.message : String(err) });
      });
    }
  }

  log('Sent invitation reminder', { invitationId: invitation.id, projectId: invitation.project_id, agentId: invitation.agent_id });
  return 'reminded';
}

async function processInvitation(client: SupabaseClient, invitation: PendingInvitation): Promise<'expired' | 'reminded' | 'noop'> {
  if (isProjectInvitationExpired(invitation)) {
    return markExpired(client, invitation);
  }

  if (isProjectInvitationReminderDue(invitation)) {
    return markReminderSent(client, invitation);
  }

  return 'noop';
}

async function runCycle() {
  const invitations = await fetchPendingInvitations(supabase);
  if (invitations.length === 0) {
    log('No pending invitations to reconcile');
    return;
  }

  let expired = 0;
  let reminded = 0;
  let noop = 0;

  for (const invitation of invitations) {
    if (stopping) break;
    try {
      const result = await processInvitation(supabase, invitation);
      if (result === 'expired') expired += 1;
      else if (result === 'reminded') reminded += 1;
      else noop += 1;
    } catch (err) {
      log('Invitation sweep error', {
        invitationId: invitation.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log('Invitation sweep cycle complete', {
    scanned: invitations.length,
    expired,
    reminded,
    noop,
    dryRun: DRY_RUN,
  });
}

async function main() {
  log('Project invitation sweep started', {
    intervalMs: POLL_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    runOnce: RUN_ONCE,
    dryRun: DRY_RUN,
  });

  do {
    try {
      await runCycle();
    } catch (err) {
      log('Sweep cycle error', { error: err instanceof Error ? err.message : String(err) });
    }

    if (RUN_ONCE || stopping) break;
    await sleep(POLL_INTERVAL_MS);
  } while (!stopping);

  log('Project invitation sweep stopped');
}

process.on('SIGINT', () => { stopping = true; if (timer) clearTimeout(timer); });
process.on('SIGTERM', () => { stopping = true; if (timer) clearTimeout(timer); });

void main().catch((err) => {
  console.error(`[${ts()}] Sweep crashed:`, err);
  process.exit(1);
});

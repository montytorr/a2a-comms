import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { isAdminAgent } from '@/lib/admin';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id: agentId } = await params;

  const supabase = createServerClient();

  // Look up the target agent
  const { data: targetAgent, error: agentError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', agentId)
    .single();

  if (agentError || !targetAgent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Authorization: must own the key or be admin
  if (auth.agent.id !== targetAgent.id && !isAdminAgent(auth.agent.id, auth.agent.name)) {
    return NextResponse.json(
      { error: 'Not authorized to rotate keys for this agent', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  // Find the current active service key for this agent
  const { data: currentKey, error: keyError } = await supabase
    .from('service_keys')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .is('expires_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (keyError || !currentKey) {
    return NextResponse.json(
      { error: 'No active service key found for this agent', code: 'NO_KEY' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Generate new signing secret
  const newSigningSecret = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();
  const newKeyId = `${currentKey.key_id.split('-rotated-')[0]}-rotated-${timestamp}`;

  // Grace period: old key expires in 1 hour
  const oldKeyExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // Set expiry on old key (grace period)
  const { error: updateError } = await supabase
    .from('service_keys')
    .update({
      expires_at: oldKeyExpiresAt,
      rotated_at: new Date().toISOString(),
    })
    .eq('id', currentKey.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Failed to update old key', code: 'DB_ERROR', details: updateError.message } satisfies ApiError,
      { status: 500 }
    );
  }

  // Insert new service key
  const newKeyHash = crypto.createHash('sha256').update(newKeyId).digest('hex');
  const { data: newKey, error: insertError } = await supabase
    .from('service_keys')
    .insert({
      key_id: newKeyId,
      key_hash: newKeyHash,
      signing_secret: newSigningSecret,
      agent_id: agentId,
      human_owner: currentKey.human_owner,
      label: currentKey.label ? `${currentKey.label} (rotated)` : 'rotated',
      is_active: true,
    })
    .select()
    .single();

  if (insertError || !newKey) {
    // Attempt to rollback the old key expiry
    await supabase
      .from('service_keys')
      .update({ expires_at: null, rotated_at: null })
      .eq('id', currentKey.id);

    return NextResponse.json(
      { error: 'Failed to create new key', code: 'DB_ERROR', details: insertError?.message } satisfies ApiError,
      { status: 500 }
    );
  }

  // Audit log
  await auditLog({
    actor: auth.agent.name,
    action: 'key.rotate',
    resourceType: 'service_key',
    resourceId: newKey.id,
    details: {
      agent_id: agentId,
      agent_name: targetAgent.name,
      old_key_id: currentKey.key_id,
      new_key_id: newKeyId,
      old_key_expires_at: oldKeyExpiresAt,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    key_id: newKeyId,
    signing_secret: newSigningSecret,
    old_key_expires_at: oldKeyExpiresAt,
    message: 'New key active. Old key valid until expiry.',
  });
}

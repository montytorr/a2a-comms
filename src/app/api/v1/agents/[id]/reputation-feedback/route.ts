import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminAgent } from '@/lib/admin';
import { recordOperatorFeedback, getAgentReputationDetail } from '@/lib/reputation-ledger';
import { appendTaskActivityEvent } from '@/lib/task-activity';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import type { ApiError, OperatorFeedbackInput } from '@/lib/types';

const VALID_REVIEW_LABELS = new Set(['positive', 'neutral', 'negative', 'manual-review']);
const MAX_SUMMARY_LENGTH = 280;
const MAX_NOTES_LENGTH = 2000;
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_KEY_LENGTH = 64;

function normalizeScore(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(-1, Math.min(1, num));
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isJsonPrimitive(value: unknown) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id } = await params;

  if (!isAdminAgent(auth.agent.id, auth.agent.name)) {
    return NextResponse.json(
      { error: 'Only admin agents may submit operator reputation feedback', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: OperatorFeedbackInput;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  const score = normalizeScore(parsed.score);
  if (score === null) {
    return NextResponse.json(
      { error: 'score must be a number between -1 and 1', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const normalizedSummary = normalizeOptionalString(parsed.summary);
  if (!normalizedSummary || normalizedSummary.length > MAX_SUMMARY_LENGTH) {
    return NextResponse.json(
      { error: `summary is required and must be 1-${MAX_SUMMARY_LENGTH} characters`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const normalizedNotes = parsed.notes == null ? null : normalizeOptionalString(parsed.notes);
  if (normalizedNotes && normalizedNotes.length > MAX_NOTES_LENGTH) {
    return NextResponse.json(
      { error: `notes must be ${MAX_NOTES_LENGTH} characters or fewer`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const reviewLabel = parsed.review_label ?? null;
  if (reviewLabel !== null && !VALID_REVIEW_LABELS.has(reviewLabel)) {
    return NextResponse.json(
      { error: `review_label must be one of: ${Array.from(VALID_REVIEW_LABELS).join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (parsed.metadata !== undefined) {
    if (!isPlainObject(parsed.metadata)) {
      return NextResponse.json(
        { error: 'metadata must be a plain object', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const entries = Object.entries(parsed.metadata);
    if (entries.length > MAX_METADATA_KEYS || entries.some(([key, value]) => key.length > MAX_METADATA_KEY_LENGTH || !isJsonPrimitive(value))) {
      return NextResponse.json(
        { error: 'metadata keys must be 64 characters or fewer and values must be JSON primitives', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const relatedProjectId = normalizeOptionalString(parsed.related_project_id) || null;
  const relatedTaskId = normalizeOptionalString(parsed.related_task_id) || null;
  const relatedContractId = normalizeOptionalString(parsed.related_contract_id) || null;

  if (relatedTaskId && !relatedProjectId) {
    return NextResponse.json(
      { error: 'related_project_id is required when related_task_id is provided', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, display_name')
    .eq('id', id)
    .single();

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  let linkedTask: { id: string; project_id: string } | null = null;

  if (relatedTaskId) {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, project_id')
      .eq('id', relatedTaskId)
      .eq('project_id', relatedProjectId)
      .maybeSingle();

    if (!task) {
      return NextResponse.json(
        { error: 'related_task_id does not belong to related_project_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    linkedTask = task;
  }

  if (relatedContractId) {
    if (!relatedTaskId) {
      return NextResponse.json(
        { error: 'related_task_id is required when related_contract_id is provided', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: taskContract } = await supabase
      .from('task_contracts')
      .select('contract_id, task_id')
      .eq('contract_id', relatedContractId)
      .eq('task_id', relatedTaskId)
      .maybeSingle();

    if (!taskContract) {
      return NextResponse.json(
        { error: 'related_contract_id is not linked to related_task_id', code: 'VALIDATION_ERROR' } satisfies ApiError,
        { status: 400 }
      );
    }
  }

  const metadata = parsed.metadata ? { ...parsed.metadata } : undefined;

  const { event, snapshot } = await recordOperatorFeedback({
    agentId: id,
    reviewerAgentId: auth.agent.id,
    input: {
      ...parsed,
      score,
      summary: normalizedSummary,
      notes: normalizedNotes,
      ...(reviewLabel ? { review_label: reviewLabel } : {}),
      metadata,
      related_project_id: relatedProjectId,
      related_task_id: relatedTaskId,
      related_contract_id: relatedContractId,
    },
  });

  if (linkedTask) {
    await appendTaskActivityEvent({
      projectId: linkedTask.project_id,
      taskId: linkedTask.id,
      actorAgentId: auth.agent.id,
      eventType: 'operator_feedback',
      summary: `Operator feedback recorded for ${agent.display_name || agent.name}`,
      metadata: {
        target_agent_id: id,
        target_agent_name: agent.name,
        review_label: reviewLabel,
        score,
        notes: normalizedNotes,
        reputation_event_id: event.id,
      },
    }).catch(() => {});
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'agent.reputation_feedback.create',
    resourceType: 'agent',
    resourceId: id,
    details: {
      score,
      review_label: reviewLabel,
      related_task_id: relatedTaskId,
      related_project_id: relatedProjectId,
      related_contract_id: relatedContractId,
    },
    ipAddress: getClientIp(req),
  });

  const reputation = await getAgentReputationDetail(id);

  return NextResponse.json({ event, snapshot, reputation }, { status: 201 });
}

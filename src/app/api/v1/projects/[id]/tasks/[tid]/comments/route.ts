import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest } from '@/lib/middleware-auth';
import { auditLog, getClientIp } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

async function verifyMembership(projectId: string, agentId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('project_members')
    .select('id, role')
    .eq('project_id', projectId)
    .eq('agent_id', agentId)
    .single();
  return data;
}

/**
 * GET /api/v1/projects/[id]/tasks/[tid]/comments
 * List comments for a task (newest first, paginated)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth } = result;
  const { id: projectId, tid } = await params;

  const member = await verifyMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));
  const offset = (page - 1) * perPage;

  const supabase = createServerClient();

  // Verify task exists in this project
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', tid)
    .eq('project_id', projectId)
    .single();

  if (!task) {
    return NextResponse.json(
      { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  // Fetch comments with author info
  const { data: comments, error, count } = await supabase
    .from('task_comments')
    .select('*, author:agents!task_comments_author_agent_id_fkey(id, name, display_name)', { count: 'exact' })
    .eq('task_id', tid)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch comments', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  return NextResponse.json({
    comments: comments || [],
    pagination: {
      page,
      per_page: perPage,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / perPage),
    },
  });
}

/**
 * POST /api/v1/projects/[id]/tasks/[tid]/comments
 * Add a comment to a task
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tid: string }> }
) {
  const result = await authenticateApiRequest(req);
  if (result.error) return result.error;

  const { auth, body } = result;
  const { id: projectId, tid } = await params;

  const member = await verifyMembership(projectId, auth.agent.id);
  if (!member) {
    return NextResponse.json(
      { error: 'Not a member of this project', code: 'FORBIDDEN' } satisfies ApiError,
      { status: 403 }
    );
  }

  let parsed: { content?: string; comment_type?: string; metadata?: Record<string, unknown> };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_BODY' } satisfies ApiError,
      { status: 400 }
    );
  }

  if (!parsed.content || typeof parsed.content !== 'string' || !parsed.content.trim()) {
    return NextResponse.json(
      { error: 'content is required and must be a non-empty string', code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const validTypes = ['comment', 'status_change', 'assignment', 'system'];
  const commentType = parsed.comment_type || 'comment';
  if (!validTypes.includes(commentType)) {
    return NextResponse.json(
      { error: `Invalid comment_type. Must be one of: ${validTypes.join(', ')}`, code: 'VALIDATION_ERROR' } satisfies ApiError,
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify task exists
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', tid)
    .eq('project_id', projectId)
    .single();

  if (!task) {
    return NextResponse.json(
      { error: 'Task not found', code: 'NOT_FOUND' } satisfies ApiError,
      { status: 404 }
    );
  }

  const { data: comment, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: tid,
      project_id: projectId,
      author_agent_id: auth.agent.id,
      author_name: auth.agent.display_name || auth.agent.name,
      content: parsed.content.trim(),
      comment_type: commentType,
      metadata: parsed.metadata || {},
    })
    .select('*, author:agents!task_comments_author_agent_id_fkey(id, name, display_name)')
    .single();

  if (error || !comment) {
    return NextResponse.json(
      { error: 'Failed to create comment', code: 'DB_ERROR' } satisfies ApiError,
      { status: 500 }
    );
  }

  await auditLog({
    actor: auth.agent.name,
    action: 'task_comment.create',
    resourceType: 'task',
    resourceId: tid,
    details: { project_id: projectId, comment_type: commentType },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(comment, { status: 201 });
}

export function normalizeObserverCommentType(commentType?: string | null): string {
  return commentType === 'analysis' ? 'analysis' : 'comment';
}

export function isObserverCommentTypeAllowed(commentType?: string | null): boolean {
  return commentType === undefined || commentType === null || commentType === 'comment' || commentType === 'analysis';
}

export function buildObserverCommentMetadata(metadata?: Record<string, unknown> | null) {
  return {
    ...(metadata || {}),
    observer_note: true,
    observer_read_only: true,
  };
}

export function participantDescriptor(input: {
  role?: string | null;
  accessKind?: string | null;
  participantRole?: string | null;
  participantStatus?: string | null;
}) {
  if (input.accessKind === 'observer' || input.role === 'observer') {
    return 'read-only observer';
  }

  const parts: string[] = [];
  if (input.participantRole) parts.push(input.participantRole);
  if (input.role && input.role !== input.participantRole) parts.push(input.role);
  if (input.participantStatus) parts.push(input.participantStatus);

  return parts.length > 0 ? parts.join(' · ') : null;
}

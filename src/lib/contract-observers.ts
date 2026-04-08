export function normalizeContractObserverNames(observers?: string[] | null): string[] {
  return Array.from(
    new Set(
      (observers || []).filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      ).map((value) => value.trim())
    )
  );
}

export function isObserverContractNote(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const record = content as Record<string, unknown>;
  return record.observer_note === true || record.observer_read_only === true || record.visibility === 'observer-note';
}

export function splitContractMessagesByVisibility<T extends { content: unknown }>(messages: T[]) {
  const observerNotes: T[] = [];
  const threadMessages: T[] = [];

  for (const message of messages) {
    if (isObserverContractNote(message.content)) {
      observerNotes.push(message);
    } else {
      threadMessages.push(message);
    }
  }

  return { threadMessages, observerNotes };
}

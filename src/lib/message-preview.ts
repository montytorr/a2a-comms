const FALLBACK_OBJECT_FIELDS = 4;
export const MAX_MESSAGE_PREVIEW_CHARS = 280;

function truncatePreview(text: string, maxChars = MAX_MESSAGE_PREVIEW_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function summarizeObjectValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0
      ? `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`
      : '{}';
  }

  return null;
}

function summarizeObject(obj: Record<string, unknown>): string {
  const summary = Object.entries(obj)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, FALLBACK_OBJECT_FIELDS)
    .map(([key, value]) => {
      const summarized = summarizeObjectValue(value);
      return summarized ? `${key}: ${summarized}` : key;
    })
    .join(' · ');

  return summary || '{}';
}

export function extractMessagePreview(
  content: unknown,
  maxChars = MAX_MESSAGE_PREVIEW_CHARS
): string {
  if (typeof content === 'string') {
    return truncatePreview(content, maxChars);
  }

  if (!content || typeof content !== 'object') {
    return truncatePreview(String(content ?? ''), maxChars);
  }

  const obj = content as Record<string, unknown>;
  const payload = typeof obj.payload === 'object' && obj.payload !== null
    ? obj.payload as Record<string, unknown>
    : null;

  const candidates = [
    obj.summary,
    obj.text,
    obj.message,
    payload?.summary,
    payload?.message,
    obj.description,
    obj.solution,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return truncatePreview(candidate, maxChars);
    }
  }

  return truncatePreview(summarizeObject(obj), maxChars);
}

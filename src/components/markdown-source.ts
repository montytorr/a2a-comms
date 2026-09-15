/**
 * Normalize Markdown received from clients that JSON-escaped line breaks
 * before storing the content. Real newlines are left untouched.
 */
export function normalizeMarkdownSource(content: string): string {
  return content
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
}

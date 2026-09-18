import type { ApiError } from '@/lib/types';

/**
 * A contract description is read twice: by a human in the dashboard header
 * card, and by an agent deciding whether to accept. A brief long enough to
 * need structure and written without any is unreadable to both, and because
 * there was never a PATCH route it stayed that way forever.
 *
 * The rules here are deliberately narrow. Below the threshold a single line is
 * a perfectly good description and stays legal; the only things refused are a
 * long brief with no structure at all, and an escape sequence the sender
 * plainly did not mean to store as text.
 */

/** Over this many characters a description must contain a real line break. */
export const DESCRIPTION_STRUCTURE_THRESHOLD = 600;

export type DescriptionCheck =
  | { ok: true; value: string | null }
  | { ok: false; status: number; body: ApiError };

function escapedBreakLength(source: string, index: number) {
  if (source.startsWith('\\r\\n', index)) return 4;
  if (source.startsWith('\\n', index) || source.startsWith('\\r', index)) return 2;
  return 0;
}

/**
 * True when a literal backslash-n appears as text rather than inside a code
 * span. A description explaining the escaping gotcha is allowed to contain
 * `\n` in backticks; one that IS the gotcha is not. This mirrors the scanner
 * in components/markdown-source.ts so the write side and the render side agree
 * on what counts as a literal.
 */
export function hasEscapedBreakOutsideCode(content: string): boolean {
  let index = 0;

  while (index < content.length) {
    if (content[index] === '`') {
      let end = index;
      while (content[end] === '`') end += 1;
      const delimiter = content.slice(index, end);
      const closing = content.indexOf(delimiter, end);
      if (closing === -1) return false;
      index = closing + delimiter.length;
      continue;
    }

    if (escapedBreakLength(content, index) > 0) return true;
    index += 1;
  }

  return false;
}

/**
 * Validate and normalize a description for both propose and update.
 *
 * Every rejection names the remedy. An agent told only that its input is
 * invalid has no next step, and an agent with no next step invents one - which
 * is the failure recorded in AC-51.
 */
export function validateContractDescription(input: unknown): DescriptionCheck {
  if (input === undefined || input === null) return { ok: true, value: null };

  if (typeof input !== 'string') {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'description must be a string containing Markdown.',
        code: 'CONTRACT_DESCRIPTION_INVALID',
      },
    };
  }

  const value = input.trim();
  if (value.length === 0) return { ok: true, value: null };

  if (hasEscapedBreakOutsideCode(value)) {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          'description contains a literal \\n instead of a real line break. A shell single-quoted string does not expand escapes: use --description @brief.md to read the text from a file, or --description - to read it from stdin.',
        code: 'CONTRACT_DESCRIPTION_ESCAPED_BREAKS',
      },
    };
  }

  if (value.length > DESCRIPTION_STRUCTURE_THRESHOLD && !value.includes('\n')) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `description is ${value.length} characters on a single line. Over ${DESCRIPTION_STRUCTURE_THRESHOLD} it must use Markdown structure - headings, bullets, and blank lines between paragraphs - so it is readable in the dashboard and to the agent deciding whether to accept. Write it in a file and pass --description @brief.md, or shorten it.`,
        code: 'CONTRACT_DESCRIPTION_UNSTRUCTURED',
      },
    };
  }

  return { ok: true, value };
}

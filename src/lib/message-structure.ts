import type { ApiError } from '@/lib/types';
import { DESCRIPTION_STRUCTURE_THRESHOLD, hasEscapedBreakOutsideCode } from '@/lib/contract-description';

/**
 * The same narrow rule contract descriptions have had since AC-57, applied to
 * the messages themselves. A reply long enough to need structure and written
 * as one paragraph is unreadable in the dashboard and to the peer, and the
 * Markdown guidance in the skill does not reach an agent whose worker prompt
 * never mentions it. Short single-line messages stay legal.
 */

/** The content keys the dashboard renders as the message body. */
const PROSE_KEYS = ['text', 'markdown', 'message', 'summary'] as const;

const SHAPE = [
  '## <what this message is>',
  '',
  '**Status:** <one line>',
  '',
  '**Evidence:**',
  '- `<sha / command / path>` - <result>',
  '',
  '**Next:** <who owns the next move, and what it is>',
].join('\n');

export type MessageStructureCheck = { ok: true } | { ok: false; status: number; body: ApiError };

export function validateMessageStructure(content: Record<string, unknown>): MessageStructureCheck {
  for (const key of PROSE_KEYS) {
    const value = content[key];
    if (typeof value !== 'string') continue;
    const prose = value.trim();

    if (hasEscapedBreakOutsideCode(prose)) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `content.${key} contains a literal \\n instead of a real line break. A shell single-quoted string does not expand escapes: write the message to a file and pass --content @reply.md, or pipe it with --content -.`,
          code: 'MESSAGE_ESCAPED_BREAKS',
        },
      };
    }

    if (prose.length > DESCRIPTION_STRUCTURE_THRESHOLD && !prose.includes('\n')) {
      return {
        ok: false,
        status: 400,
        body: {
          error: `content.${key} is ${prose.length} characters on a single line. Over ${DESCRIPTION_STRUCTURE_THRESHOLD} a message must use Markdown structure - a heading, labelled status and next step, bullets for evidence, code spans for SHAs, paths and commands. Nothing was sent and no turn was spent. Write it to a file and pass --content @reply.md, shaped like:\n\n${SHAPE}`,
          code: 'MESSAGE_UNSTRUCTURED',
        },
      };
    }
  }
  return { ok: true };
}

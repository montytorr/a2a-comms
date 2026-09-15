const BLOCK_START = /^(?:#{1,6}\s|[-*+]\s|>\s|\d+[.)]\s)/;

function escapedBreakLength(source: string, index: number) {
  if (source.startsWith('\\r\\n', index)) return 4;
  if (source.startsWith('\\n', index) || source.startsWith('\\r', index)) return 2;
  return 0;
}

/** Restore structural escaped breaks while preserving prose and code literals. */
export function normalizeMarkdownSource(content: string): string {
  let output = '';
  let index = 0;

  while (index < content.length) {
    if (content[index] === '`') {
      let end = index;
      while (content[end] === '`') end += 1;
      const delimiter = content.slice(index, end);
      const closing = content.indexOf(delimiter, end);
      if (closing === -1) {
        output += content.slice(index);
        break;
      }
      output += content.slice(index, closing + delimiter.length);
      index = closing + delimiter.length;
      continue;
    }

    const breakLength = escapedBreakLength(content, index);
    if (breakLength > 0) {
      const rest = content.slice(index + breakLength);
      const whitespace = rest.match(/^[ \t]*/)?.[0].length ?? 0;
      const afterWhitespace = rest.slice(whitespace);
      const nextBreak = escapedBreakLength(content, index + breakLength + whitespace);
      if (nextBreak > 0 || BLOCK_START.test(afterWhitespace)) {
        output += '\n';
        index += breakLength + whitespace;
        continue;
      }
    }

    output += content[index];
    index += 1;
  }

  return output;
}

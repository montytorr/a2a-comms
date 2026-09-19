import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/** Strips /* … *\/ comments so selectors inside prose are not mistaken for rules. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Block { name: string; start: number; end: number }

/** Spans of every top-level `@layer <name> { … }` block, by character offset. */
function layerBlocks(css: string): Block[] {
  const blocks: Block[] = [];
  const open = /@layer\s+([a-z-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(css))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push({ name: m[1], start: m.index, end: i });
    open.lastIndex = i;
  }
  return blocks;
}

test('every class rule in globals.css sits inside @layer components', () => {
  const css = stripComments(read('src/app/globals.css'));
  const blocks = layerBlocks(css);
  const components = blocks.find((b) => b.name === 'components');
  assert.ok(components, 'globals.css must declare an @layer components block');

  // Tailwind v4 emits utilities into `@layer utilities`, and UNLAYERED css
  // beats every layer no matter the specificity or source order. A class rule
  // left outside the layer silently wins against any utility touching the same
  // property — which is how `className="btn md:hidden"` rendered a button at
  // every width and `className="kbd hidden sm:inline-flex"` put the ⌘K chip on
  // a phone. Both were live in production and invisible to every other check.
  const stray: string[] = [];
  const rule = /(^|[}{;])\s*([^{}@;]*?\.[A-Za-z][^{}@;]*?)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css))) {
    const at = m.index + m[1].length;
    if (at >= components.start && at <= components.end) continue;
    const selector = m[2].trim().replace(/\s+/g, ' ');
    // `:root.light` and `html.light` are theme hooks on the root element, which
    // carries no utility classes, and the [data-*] hooks only redefine custom
    // properties. Nothing can collide with them.
    if (/^(:root|html)\b/.test(selector)) continue;
    stray.push(`${selector} (offset ${at})`);
  }
  assert.deepEqual(stray, [], `these rules would shadow Tailwind utilities:\n${stray.join('\n')}`);
});

test('the mobile drawer is portalled out of the filtered topbar', () => {
  const topbar = read('src/components/topbar.tsx');
  const nav = read('src/components/mobile-nav.tsx');

  // A `filter` or `backdrop-filter` makes an element the containing block for
  // its `position: fixed` descendants. The nav trigger is rendered inside the
  // topbar, so while the drawer rendered in place, `fixed inset-0` resolved
  // against the 52px header: the scrim covered only that strip and the nav
  // list spilled down the page, unbacked, over the content behind it.
  const filtered = /backdropFilter|backdrop-filter|(?<![a-zA-Z])filter:/.test(topbar);
  if (filtered) {
    assert.match(
      nav,
      /createPortal\(\s*drawer\s*,\s*document\.body\s*\)/,
      'topbar still creates a containing block, so the drawer must portal to document.body',
    );
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A ratchet on visual entropy.
 *
 * AC-61 — burning down the inline styles — was cancelled for a good reason:
 * "Rewriting them with no UI test safety net is real regression risk for no
 * stated payoff." Colour has a safety net (`color-contrast.test.ts` computes
 * real WCAG ratios) and the cascade has one (`css-cascade.test.ts`). Geometry
 * had nothing, so every convergence step was unfalsifiable.
 *
 * This is the missing half. It does not assert that the numbers are RIGHT —
 * nobody can write that test — it asserts they never get WORSE. Each count is
 * a ceiling: converging a page lowers the real number, and the ceiling is
 * lowered with it in the same commit. Adding a thirty-second distinct padding
 * value fails here instead of being noticed a year later by an audit.
 *
 * The screenshots are the other half, and they are deliberately not in CI:
 * `scripts/ui-audit.mjs` drives a real logged-in browser and needs a running
 * stack. Run it when converging a page; this runs on every commit.
 */

const root = process.cwd();

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src/**/*.tsx'], { encoding: 'utf8', cwd: root })
    .trim().split('\n').filter(Boolean)
    // Email templates are a different rendering context: mail clients strip
    // stylesheets, so inline styles are mandatory and none of the design
    // tokens exist there. Holding them to the dashboard's scale would be
    // measuring the wrong thing, and their 800-weight logo is correct.
    .filter((f) => !f.startsWith('src/emails/') && !f.startsWith('src/lib/email/templates/'));
}

const sources = sourceFiles().map((f) => readFileSync(join(root, f), 'utf8'));

function distinct(property: string): Set<string> {
  const found = new Set<string>();
  const re = new RegExp(`\\b${property}:\\s*('[^']*'|"[^"]*"|[0-9.]+)`, 'g');
  for (const text of sources) {
    for (const m of text.matchAll(re)) found.add(m[1]!.replace(/['"]/g, ''));
  }
  return found;
}

/**
 * Ceilings, measured 2026-09-19. LOWER these as pages converge onto the
 * --space-* and --radius-* scales; never raise one to make a commit pass.
 */
const CEILING = {
  inlineStyleProps: 2496,
  distinctPadding: 82,
  distinctBorderRadius: 22,
  distinctGap: 32,
  distinctFontWeight: 4,
  distinctIconSizes: 18,
};

test('inline style props do not increase', () => {
  const count = sources.reduce((n, t) => n + (t.match(/style=\{\{/g) ?? []).length, 0);
  assert.ok(count <= CEILING.inlineStyleProps,
    `${count} inline style props, ceiling ${CEILING.inlineStyleProps}. Inline styles cannot express a media query, which is why the responsive bugs live in them.`);
});

test('the number of distinct spacing values does not increase', () => {
  for (const [property, key] of [['padding', 'distinctPadding'], ['gap', 'distinctGap']] as const) {
    const n = distinct(property).size;
    assert.ok(n <= CEILING[key],
      `${n} distinct ${property} values, ceiling ${CEILING[key]}. The scale is --space-1..6 (4/8/12/16/24/32).`);
  }
});

test('the number of distinct radii does not increase', () => {
  const n = distinct('borderRadius').size;
  assert.ok(n <= CEILING.distinctBorderRadius,
    `${n} distinct borderRadius values, ceiling ${CEILING.distinctBorderRadius}. The scale is --radius-1..4 plus --radius-pill.`);
});

test('font weights stay on the scale', () => {
  const weights = distinct('fontWeight');
  // 650 and 800 are gone: 650 meant "slightly bolder than a heading" in three
  // unrelated places, and 800 sat on a headline whose emphasis already comes
  // from being 30px. The scale is 400/500/600/700.
  assert.ok(weights.size <= CEILING.distinctFontWeight,
    `${weights.size} distinct fontWeight values: ${[...weights].sort().join(', ')}`);
});

test('icon sizes do not proliferate further', () => {
  const sizes = new Set<string>();
  for (const text of sources) for (const m of text.matchAll(/size=\{(\d+)\}/g)) sizes.add(m[1]!);
  assert.ok(sizes.size <= CEILING.distinctIconSizes,
    `${sizes.size} distinct icon sizes: ${[...sizes].sort((a, b) => +a - +b).join(', ')}. The top three used to be 13, 14 and 15 — one pixel apart.`);
});

test('the ceilings are honest — each is at or above the real count', () => {
  // A ceiling far above reality is not a ratchet, it is a comment. This keeps
  // them within a small margin so they actually bite.
  const real = {
    inlineStyleProps: sources.reduce((n, t) => n + (t.match(/style=\{\{/g) ?? []).length, 0),
    distinctPadding: distinct('padding').size,
    distinctBorderRadius: distinct('borderRadius').size,
    distinctGap: distinct('gap').size,
    distinctFontWeight: distinct('fontWeight').size,
  };
  for (const [key, value] of Object.entries(real)) {
    const ceiling = CEILING[key as keyof typeof CEILING];
    assert.ok(value <= ceiling, `${key}: ${value} exceeds its ceiling ${ceiling}`);
    const slack = key === 'inlineStyleProps' ? 120 : 6;
    assert.ok(ceiling - value <= slack,
      `${key} ceiling ${ceiling} is ${ceiling - value} above the real count ${value} — lower it, or the ratchet does nothing`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, oklchToRgb, parseOklch } from '@/lib/color-contrast';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/**
 * The value of a token in one theme, following the cascade: `:root.light` when
 * it overrides, the base `:root` otherwise. A token that is deliberately shared
 * — `--on-brand`, the fonts, the spacing — resolves to its single definition
 * rather than being reported missing.
 */
function token(name: string, theme: 'dark' | 'light'): string {
  const base = css.slice(css.indexOf(':root {'), css.indexOf(':root.light'));
  const override = css.slice(css.indexOf(':root.light'));
  const read = (block: string) => block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();

  const value = (theme === 'light' ? read(override) ?? read(base) : read(base));
  assert.ok(value, `${name} is not defined for ${theme}`);
  return value;
}

function rgbOf(name: string, theme: 'dark' | 'light') {
  const value = token(name, theme);
  const parsed = parseOklch(value);
  assert.ok(parsed, `${name} (${theme}) is not an oklch colour: ${value}`);
  return parsed;
}

test('the conversion agrees with known sRGB anchors', () => {
  // White and black are the two values a wrong matrix gets wrong first.
  assert.deepEqual(oklchToRgb(1, 0, 0), { r: 255, g: 255, b: 255 });
  assert.deepEqual(oklchToRgb(0, 0, 0), { r: 0, g: 0, b: 0 });
  assert.equal(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }).toFixed(0), '21');
});

test('the primary button is legible in BOTH themes', () => {
  // It was not: the gradient is fixed in both themes while the solid-face ink
  // (then --on-amber, now --on-brand-solid) flips to white in light, which
  // measured 1.87:1. The ink is read out of the RULE rather than assumed, so
  // putting a flipping ink back fails this test instead of
  // passing it — the first version of this check tested the token it hoped the
  // button used, which would not have caught the bug it was written for.
  const rule = css.match(/\.btn--primary\s*\{([^}]*)\}/);
  assert.ok(rule, 'could not find the .btn--primary rule');

  const inkToken = rule[1]!.match(/color:\s*var\((--[a-z0-9-]+)\)/)?.[1];
  assert.ok(inkToken, '.btn--primary must take its colour from a token');

  const stops = [...css.matchAll(/\.btn--primary(?::hover)?\s*\{[^}]*?linear-gradient\(180deg,\s*(oklch\([^)]*\)),\s*(oklch\([^)]*\))/g)];
  assert.ok(stops.length >= 1, 'could not find the .btn--primary gradient');

  for (const theme of ['dark', 'light'] as const) {
    const ink = rgbOf(inkToken, theme);
    for (const match of stops) {
      for (const stop of [match[1]!, match[2]!]) {
        const bg = parseOklch(stop);
        assert.ok(bg, `unparsed gradient stop: ${stop}`);
        const ratio = contrastRatio(ink, bg);
        assert.ok(
          ratio >= 4.5,
          `.btn--primary ${inkToken} on ${stop} in ${theme} is ${ratio.toFixed(2)}:1, below 4.5:1`,
        );
      }
    }
  }
});

test('body text clears AA against its own background, in both themes', () => {
  for (const theme of ['dark', 'light'] as const) {
    const bg = rgbOf('--bg-0', theme);
    // --fg-4 is the faintest text the palette offers; if it passes, all do.
    for (const fg of ['--fg-0', '--fg-1', '--fg-2', '--fg-3', '--fg-4'] as const) {
      const ratio = contrastRatio(rgbOf(fg, theme), bg);
      assert.ok(ratio >= 4.5, `${fg} on --bg-0 in ${theme} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('every accent reads against the surface it is painted on', () => {
  // --brand/--amber/--mint/--peri/--rose are used as TEXT on their own tinted --*-bg.
  for (const theme of ['dark', 'light'] as const) {
    for (const hue of ['brand', 'amber', 'mint', 'peri', 'rose'] as const) {
      const ratio = contrastRatio(rgbOf(`--${hue}`, theme), rgbOf(`--${hue}-bg`, theme));
      assert.ok(
        ratio >= 4.5,
        `--${hue} on --${hue}-bg in ${theme} is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
      );
    }
  }
});

test('brand text and the ink on a solid brand face read in both themes', () => {
  // --brand is the link colour on the page ground and on white cards, and a
  // checked box paints --on-brand-solid on a solid --brand face.
  for (const theme of ['dark', 'light'] as const) {
    const brand = rgbOf('--brand', theme);
    for (const [label, other] of [
      ['--bg-0', rgbOf('--bg-0', theme)],
      ['--bg-1', rgbOf('--bg-1', theme)],
      ['--on-brand-solid', rgbOf('--on-brand-solid', theme)],
    ] as const) {
      const ratio = contrastRatio(brand, other);
      assert.ok(ratio >= 4.5, `--brand against ${label} in ${theme} is ${ratio.toFixed(2)}:1`);
    }
  }
});

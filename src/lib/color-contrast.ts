/**
 * OKLCH → sRGB and WCAG contrast, so the design tokens can be checked rather
 * than eyeballed.
 *
 * This exists because `.btn--primary` shipped white text on a fixed amber
 * gradient in light mode — 1.87:1 against a 4.5:1 requirement, on the most
 * prominent control in the product — and nothing could have caught it. The
 * palette annotates its own contrast ratios in comments, which is exactly the
 * kind of claim that goes stale the first time a value moves.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH as CSS spells it: L in 0..1, C in 0..0.4ish, H in degrees. */
export function oklchToRgb(l: number, c: number, hDegrees: number): Rgb {
  const h = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const bb = c * Math.sin(h);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.2914855480 * bb) ** 3;

  const linear = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.7076147010 * sCone,
  ];

  // Gamut clipping, the same thing a browser does when the colour is out of
  // sRGB. A clipped channel changes the measured ratio, so clip before
  // measuring rather than after.
  const encode = (channel: number) => {
    const v = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };

  return { r: encode(linear[0]!), g: encode(linear[1]!), b: encode(linear[2]!) };
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Parse `oklch(0.82 0.16 65)` / `oklch(0.7 0.1 60 / 0.5)` out of a CSS string. */
export function parseOklch(value: string): Rgb | null {
  const m = value.match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)/i,
  );
  if (!m) return null;
  const rawL = m[1]!;
  const l = rawL.endsWith('%') ? parseFloat(rawL) / 100 : parseFloat(rawL);
  return oklchToRgb(l, parseFloat(m[2]!), parseFloat(m[3]!));
}

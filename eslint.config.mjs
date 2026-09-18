import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Design-system ratchets.
 *
 * Both rules guard invariants the UI refactor established. They ran as `warn`
 * while the existing violations were worked down — the warning count was the
 * progress counter (see AC-37). That count reached zero on 2026-09-18, so they
 * are now `error`: regression is mechanically impossible rather than a matter
 * of discipline, which was the whole point of counting.
 *
 * There is exactly one suppression, in components/atoms/avatar.tsx, where the
 * glyph size is proportional to a `size` prop and therefore cannot be a fixed
 * step from the scale. Any new suppression wants the same kind of reason.
 */
const designSystemRatchets = {
  files: ["src/**/*.ts", "src/**/*.tsx"],
  // Email templates are exempt from both rules. Mail clients do not load the
  // stylesheet, so inline styles are the only thing that renders, and a
  // themed var(--token) would resolve to nothing in an inbox.
  ignores: ["src/lib/email/**", "src/emails/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // Typography must come from the shared scale, not per-call-site pixels.
        // Inline styles also cannot express breakpoints, so every one of these
        // is a size that can never respond to the viewport.
        selector:
          "JSXAttribute[name.name='style'] Property[key.name='fontSize']",
        message:
          "Use a text-* utility from the type scale instead of an inline fontSize — inline styles cannot express breakpoints.",
      },
      {
        // Hardcoded oklch() literals are welded to the dark palette and will
        // not follow a theme swap; var(--token) references will.
        selector: "Literal[value=/oklch\\(/]",
        message:
          "Use a var(--token) reference instead of a hardcoded oklch() literal — literals do not follow the theme.",
      },
      {
        selector: "TemplateElement[value.raw=/oklch\\(/]",
        message:
          "Use a var(--token) reference instead of a hardcoded oklch() literal — literals do not follow the theme.",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  designSystemRatchets,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

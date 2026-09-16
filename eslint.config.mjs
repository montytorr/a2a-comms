import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Design-system ratchets.
 *
 * Both rules guard invariants the UI refactor is establishing, and both are
 * deliberately `warn` rather than `error` while the existing violations are
 * worked down — the warning count is the progress counter (see AC-37). Flip
 * each to `error` once its count reaches zero, at which point regression
 * becomes mechanically impossible rather than a matter of discipline.
 */
const designSystemRatchets = {
  files: ["src/**/*.ts", "src/**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "warn",
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

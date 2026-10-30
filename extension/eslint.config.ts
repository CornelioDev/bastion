// SPDX-License-Identifier: MIT OR Apache-2.0

import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// ESLint (`pnpm lint`) checks code quality; Prettier owns formatting, so the
// last entry turns off every rule that would disagree with it.
export default defineConfig(
  // Build output. node_modules/ is always ignored.
  globalIgnores(["dist/", "coverage/"]),

  js.configs.recommended,
  // Also turns off `no-undef` in TypeScript files, where TypeScript reports
  // undefined names itself, so no list of browser or Node.js globals is needed.
  tseslint.configs.recommended,

  // `args: "all"` and the `_` prefix match what TypeScript's
  // `noUnusedParameters` reports and accepts.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "all", argsIgnorePattern: "^_" },
      ],
    },
  },

  // Directive comments: every `eslint-disable` must say why (AGENTS.md:
  // lints are not suppressed without a comment explaining why), as in
  // `// eslint-disable-next-line <rule> -- <reason>`.
  comments.recommended,
  {
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },

  prettier,
);

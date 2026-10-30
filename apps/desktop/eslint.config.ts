// SPDX-License-Identifier: MIT OR Apache-2.0

import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import vue from "eslint-plugin-vue";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// ESLint (`pnpm lint`) checks code quality; Prettier owns formatting, so the
// last entry turns off every rule that would disagree with it.
export default defineConfig(
  // Build output and generated files. node_modules/ is always ignored. The
  // Rust side (src-tauri/) has rustfmt and clippy instead.
  globalIgnores(["dist/", "coverage/", "src-tauri/"]),

  js.configs.recommended,
  tseslint.configs.recommended,

  // Vue style guide priorities A and B (AGENTS.md, "Conventions"), plus C.
  vue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      // Parses `<script setup lang="ts">` with TypeScript, so the
      // typescript-eslint rules apply inside components too.
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Components use `<script setup lang="ts">` (AGENTS.md, "Conventions").
      "vue/block-lang": ["error", { script: { lang: "ts" } }],
      "vue/component-api-style": ["error", ["script-setup"]],
      // `v-html` inserts a string as HTML without escaping it, the main way
      // to open an XSS hole in a Vue app; in the Tauri webview, injected
      // script could call the app's IPC. `flat/recommended` only warns.
      "vue/no-v-html": "error",
      // TypeScript already reports undefined names, and knows the browser
      // and Vue globals that this rule would need to be told about.
      "no-undef": "off",
    },
  },

  {
    files: ["src/**", "tests/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["*.config.ts", "tests/**"],
    languageOptions: { globals: globals.node },
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

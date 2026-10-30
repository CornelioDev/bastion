// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.7: the ESLint flat config applies
 * `typescript-eslint` and `eslint-plugin-vue` (Vue style guide priorities A
 * and B, AGENTS.md "Conventions"), and agrees with Prettier.
 *
 * The tests lint code given as text, under the name of a file that exists in
 * the app (src/main.ts, src/App.vue), through ESLint's Node.js API with the
 * project's own configuration. The file on disk is not read or changed.
 *
 * Criteria covered:
 *
 * - typescript-eslint lints TypeScript files, and `any` is reported
 *   (AGENTS.md: "no `any` without a justifying comment"):
 *   "reports an explicit any in a TypeScript file".
 * - typescript-eslint also lints `<script setup lang="ts">` in Vue files:
 *   "reports an explicit any in a Vue component's TypeScript script".
 * - eslint-plugin-vue applies the priority A (essential) rules:
 *   "reports a v-for without a key (Vue style guide priority A)".
 * - eslint-plugin-vue applies the priority B (strongly recommended) rules:
 *   "reports the long form of v-on (Vue style guide priority B)".
 * - ESLint and Prettier do not fight over formatting: ESLint's fixes leave
 *   Prettier's output unchanged:
 *   "leaves a Prettier-formatted Vue component unchanged when fixing".
 *
 * Each test only checks that the expected rule is reported, not that it is
 * the only problem, and accepts it as a warning or an error: `pnpm lint`
 * and the lefthook job fail on warnings too. These tests use the Node.js
 * environment because ESLint and Prettier run there, not in a browser.
 *
 * @vitest-environment node
 */

import { ESLint, type Linter } from "eslint";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";

const linter = new ESLint();
const fixer = new ESLint({ fix: true });

/** Lints `code` as if it were the contents of `filePath`. */
async function lintAs(
  filePath: string,
  code: string,
): Promise<Linter.LintMessage[]> {
  const results = await linter.lintText(code, { filePath, warnIgnored: true });
  return results.flatMap((result) => result.messages);
}

/** Returns `code` after ESLint's fixes, linted as the contents of `filePath`. */
async function fixAs(filePath: string, code: string): Promise<string> {
  // An ignored file would come back unchanged without being linted.
  expect(await fixer.isPathIgnored(filePath)).toBe(false);
  const results = await fixer.lintText(code, { filePath, warnIgnored: true });
  const outputs = results.map((result) => result.output ?? code);
  expect(outputs).toHaveLength(1);
  return outputs.join("");
}

function expectNoParseErrors(messages: Linter.LintMessage[]): void {
  expect(messages.filter((message) => message.fatal === true)).toEqual([]);
}

describe("ESLint configuration (T-0.7)", () => {
  it("reports an explicit any in a TypeScript file", async () => {
    const messages = await lintAs(
      "src/main.ts",
      "export const value: any = 1;\n",
    );

    expectNoParseErrors(messages);
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: "@typescript-eslint/no-explicit-any" }),
    );
  });

  it("reports an explicit any in a Vue component's TypeScript script", async () => {
    const code = [
      '<script setup lang="ts">',
      "const value: any = 1;",
      "</script>",
      "",
      "<template>",
      "  <main>{{ value }}</main>",
      "</template>",
      "",
    ].join("\n");

    const messages = await lintAs("src/App.vue", code);

    expectNoParseErrors(messages);
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: "@typescript-eslint/no-explicit-any" }),
    );
  });

  it("reports a v-for without a key (Vue style guide priority A)", async () => {
    const code = [
      '<script setup lang="ts">',
      "const items: string[] = [];",
      "</script>",
      "",
      "<template>",
      "  <ul>",
      '    <li v-for="item in items">{{ item }}</li>',
      "  </ul>",
      "</template>",
      "",
    ].join("\n");

    const messages = await lintAs("src/App.vue", code);

    expectNoParseErrors(messages);
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: "vue/require-v-for-key" }),
    );
  });

  it("reports the long form of v-on (Vue style guide priority B)", async () => {
    const code = [
      '<script setup lang="ts">',
      'import { ref } from "vue";',
      "",
      "const count = ref(0);",
      "</script>",
      "",
      "<template>",
      '  <button type="button" v-on:click="count++">{{ count }}</button>',
      "</template>",
      "",
    ].join("\n");

    const messages = await lintAs("src/App.vue", code);

    expectNoParseErrors(messages);
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: "vue/v-on-style" }),
    );
  });

  it("leaves a Prettier-formatted Vue component unchanged when fixing", async () => {
    // Several attributes and the content on one line: Prettier keeps them
    // that way, while formatting rules of eslint-plugin-vue would split them
    // across lines.
    const source = [
      '<script setup lang="ts">',
      'const label = "Start";',
      "</script>",
      "",
      "<template>",
      "  <main>",
      '    <button type="button" class="primary" name="start">{{ label }}</button>',
      "  </main>",
      "</template>",
      "",
    ].join("\n");
    const filePath = "src/App.vue";
    const options = await prettier.resolveConfig(filePath);
    const formatted = await prettier.format(source, {
      ...options,
      filepath: filePath,
    });

    const fixed = await fixAs(filePath, formatted);

    expect(fixed).toBe(formatted);
  });
});

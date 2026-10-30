// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

// Vitest (`pnpm test`) builds the tests with the app's Vite config, so
// single-file components compile the same way as in the app.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Unit tests sit next to the code they test; acceptance tests live in
      // tests/acceptance/ (docs/workflow.md).
      include: ["src/**/*.spec.ts", "tests/**/*.spec.ts"],
      // Components render into a simulated DOM. A test that needs plain
      // Node.js instead says so with a `@vitest-environment node` comment.
      environment: "jsdom",
      // Vitest's default of 5 seconds is too short for a test that runs
      // ESLint: the first lint loads the ESLint config (TypeScript compiled
      // on the fly, typescript-eslint, eslint-plugin-vue), which takes about
      // 3 seconds on its own and over 5 when the machine is busy. A test
      // that hangs still fails, just later.
      testTimeout: 30_000,
      // The same goes for setup hooks, whose default is 10 seconds: the
      // component gallery's `beforeAll` (t0-8-component-gallery.spec.ts)
      // compiles every shadcn-vue component and the libraries they use,
      // which takes over 5 seconds on its own and close to 10 while other
      // test files run `vite build` at the same time. Hooks that need longer
      // still, such as those builds, set their own timeout.
      hookTimeout: 30_000,
    },
  }),
);

// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "vitest/config";

// Vitest (`pnpm test`). The extension has no components to compile, so the
// tests do not need the build's Vite config.
export default defineConfig({
  test: {
    // Unit tests sit next to the code they test; acceptance tests live in
    // tests/acceptance/ (docs/workflow.md).
    include: ["src/**/*.spec.ts", "tests/**/*.spec.ts"],
    environment: "node",
    // Vitest's defaults of 5 seconds for a test and 10 for a setup hook are
    // too short for a real `vite build` on a busy machine (src/build.spec.ts).
    // A test that hangs still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

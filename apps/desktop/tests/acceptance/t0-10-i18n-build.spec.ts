// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.10: vue-i18n in the production build works under
 * the app's Content Security Policy (src-tauri/tauri.conf.json), which has
 * no `'unsafe-eval'`. Some builds of vue-i18n compile messages into
 * JavaScript at runtime with `new Function`, which that policy blocks; the
 * shipped app must translate without it (precompiled messages, or vue-i18n's
 * message compiler that does not generate code).
 *
 * The test runs a production build of the frontend, the `vite build` step of
 * `pnpm build`, with the project's own Vite config, into a temporary
 * directory (dist/ is not touched), in a separate Node.js process without
 * Vitest's environment variables, as t0-8-dev-only-gallery.spec.ts does.
 *
 * Contract:
 *
 * 1. The production build includes vue-i18n: the shipped JavaScript
 *    contains vue-i18n's own identifiers (the `global-vue-i18n` injection
 *    key name or the `[intlify]` / `vue-i18n` markers its code carries). If
 *    the bundler drops every one of them, this check needs another marker;
 *    the maintainer decides.
 * 2. No shipped JavaScript evaluates strings as code: no `eval(`, no
 *    `new Function` and no call of `Function(` as a constructor.
 *
 * Tests and the rules they cover:
 *
 * - "ships vue-i18n in the production build": rule 1, which keeps the next
 *   test from passing on a build without vue-i18n.
 * - "ships no code that evaluates strings at runtime": rule 2.
 *
 * Checked in validation instead: in the built app (`pnpm tauri build`), no
 * CSP violation, and text translated in both locales.
 *
 * @vitest-environment node
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));

interface BuiltFile {
  /** Path relative to the build's output directory, with forward slashes. */
  path: string;
  contents: string;
}

let outDir: string;
let scripts: BuiltFile[];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function productionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "NODE_ENV" || key.startsWith("VITEST") || key === "TEST") {
      continue;
    }
    env[key] = value;
  }
  return env;
}

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), "bastion-t0-10-build-"));
  const vite = join(appRoot, "node_modules", "vite", "bin", "vite.js");
  const result = spawnSync(
    process.execPath,
    [vite, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"],
    { cwd: appRoot, env: productionEnv(), encoding: "utf8" },
  );
  expect(
    result.status,
    `vite build should succeed:\n${result.stdout}\n${result.stderr}`,
  ).toBe(0);

  scripts = listFiles(outDir)
    .filter((file) => /\.m?js$/.test(file))
    .map((file) => ({
      path: relative(outDir, file).split(sep).join("/"),
      contents: readFileSync(file, "utf8"),
    }));
}, 180_000);

afterAll(() => {
  if (outDir !== undefined) {
    rmSync(outDir, { recursive: true, force: true });
  }
});

describe("vue-i18n in the production build (T-0.10)", () => {
  it("ships vue-i18n in the production build", () => {
    expect(
      scripts.length,
      "the build should contain JavaScript",
    ).toBeGreaterThan(0);

    const markers = ["global-vue-i18n", "[intlify]", "vue-i18n"];
    const found = scripts.some((file) =>
      markers.some((marker) => file.contents.includes(marker)),
    );

    expect(found, `one of ${markers.join(", ")} in the built code`).toBe(true);
  });

  it("ships no code that evaluates strings at runtime", () => {
    // `Function(` preceded by a letter, digit, `_`, `$` or `.` is another
    // name (isFunction(, obj.Function(), not the global constructor.
    const patterns = [
      /\bnew\s+Function\b/g,
      /(?<![\w$.])Function\s*\(/g,
      /(?<![\w$.])eval\s*\(/g,
    ];

    const found = scripts.flatMap((file) =>
      patterns.flatMap((pattern) =>
        [...file.contents.matchAll(pattern)].map((match) => {
          const start = Math.max(0, match.index - 60);
          const context = file.contents.slice(start, match.index + 60);
          return `${file.path}: …${context}…`;
        }),
      ),
    );

    expect(found).toEqual([]);
  });
});

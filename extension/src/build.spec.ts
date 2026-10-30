// SPDX-License-Identifier: MIT OR Apache-2.0

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

// Builds with the real vite.config.ts, into a temporary directory so that the
// test leaves dist/ alone.
describe("the build output", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), "bastion-extension-build-"));
    await build({
      root,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("contains exactly the files the browser needs", () => {
    const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(outDir, join(entry.parentPath, entry.name)).replaceAll(
          "\\",
          "/",
        ),
      )
      .sort();

    expect(files).toEqual([
      "_locales/en/messages.json",
      "_locales/es/messages.json",
      "manifest.json",
      "service-worker.js",
    ]);
  });

  it("copies the manifest unchanged, and its service worker exists", () => {
    const source = readFileSync(new URL("manifest.json", import.meta.url));
    const built = readFileSync(join(outDir, "manifest.json"));

    expect(built.equals(source)).toBe(true);

    const manifest = JSON.parse(built.toString("utf-8")) as {
      background: { service_worker: string };
    };
    expect(existsSync(join(outDir, manifest.background.service_worker))).toBe(
      true,
    );
  });
});

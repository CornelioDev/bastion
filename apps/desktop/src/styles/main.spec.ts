// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * The stylesheets load nothing from the network. The app makes no network
 * requests at runtime and its Content Security Policy would block them, but
 * `shadcn-vue init` and `shadcn-vue add` put a Google Fonts `@import` at the
 * top of main.css every time they run (main.css, top comment).
 *
 * @vitest-environment node
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const stylesDir = fileURLToPath(new URL(".", import.meta.url));

/** Every stylesheet in src/styles/, as [path relative to it, contents]. */
function stylesheets(): [string, string][] {
  return readdirSync(stylesDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(stylesDir, path), readFileSync(path, "utf8")];
    });
}

/**
 * What a stylesheet would fetch from another origin with: an `@import` or a
 * `url()` of an absolute (`https://`) or protocol-relative (`//`) URL, and
 * the Google Fonts hosts, whatever the syntax.
 */
const REMOTE_PATTERNS: RegExp[] = [
  /@import\s+(?:url\(\s*)?["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i,
  /url\(\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i,
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
];

/** Whether `contents` refers to anything on another origin. */
function loadsFromNetwork(contents: string): boolean {
  return REMOTE_PATTERNS.some((pattern) => pattern.test(contents));
}

describe("stylesheets", () => {
  it("finds the app's stylesheet", () => {
    expect(stylesheets().map(([path]) => path)).toContain("main.css");
  });

  it("load nothing from the network", () => {
    const remote = stylesheets()
      .filter(([, contents]) => loadsFromNetwork(contents))
      .map(([path]) => path);

    expect(remote).toEqual([]);
  });

  it.each([
    "@import url('https://fonts.googleapis.com/css2?family=Geist&display=swap');",
    '@import "https://example.com/theme.css";',
    "@import url(//example.com/theme.css);",
    '@font-face { src: url("https://fonts.gstatic.com/s/geist.woff2"); }',
    "body { background: url(http://example.com/a.png); }",
  ])("recognizes a remote reference: %s", (css) => {
    expect(loadsFromNetwork(css)).toBe(true);
  });

  it.each([
    '@import "tailwindcss";',
    '@import "./shadcn-vue.css";',
    '@font-face { src: url("../assets/fonts/geist.woff2"); }',
  ])("accepts a local reference: %s", (css) => {
    expect(loadsFromNetwork(css)).toBe(false);
  });
});

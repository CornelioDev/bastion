// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * main.css keeps Bastion's corner radius scale: each `--radius-*` step is a
 * fixed offset from the base `--radius` (main.css, comment above the
 * scale). The shadcn-vue CLI may write its own scale, multiples of
 * `--radius`, over it.
 *
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mainCss = readFileSync(new URL("./main.css", import.meta.url), "utf8");

/** The scale as docs/ui-stack.md documents it: 4, 6, 8, 12, 14, 16 and 20px. */
const SCALE: Record<string, string> = {
  "--radius-sm": "calc(var(--radius) - 8px)",
  "--radius-md": "calc(var(--radius) - 6px)",
  "--radius-lg": "calc(var(--radius) - 4px)",
  "--radius-xl": "var(--radius)",
  "--radius-2xl": "calc(var(--radius) + 2px)",
  "--radius-3xl": "calc(var(--radius) + 4px)",
  "--radius-4xl": "calc(var(--radius) + 8px)",
};

/** Every `--radius-<step>` declaration in `css`, as name → value. */
function radiusSteps(css: string): Record<string, string> {
  const steps: Record<string, string> = {};
  for (const match of css.matchAll(/(--radius-[a-z0-9]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      steps[name] = value.trim();
    }
  }
  return steps;
}

describe("corner radius scale", () => {
  it("is the documented offsets from --radius", () => {
    expect(radiusSteps(mainCss)).toEqual(SCALE);
  });

  it("reads every step from a stylesheet", () => {
    const css =
      "@theme inline { --radius-sm: calc(var(--radius) * 0.6); --radius-lg: var(--radius); }";
    expect(radiusSteps(css)).toEqual({
      "--radius-sm": "calc(var(--radius) * 0.6)",
      "--radius-lg": "var(--radius)",
    });
  });
});

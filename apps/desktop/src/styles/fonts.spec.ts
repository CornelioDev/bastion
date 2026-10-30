// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * The bundled fonts ship with their license. Geist and Geist Mono are under
 * the SIL Open Font License, which asks that every copy of the fonts comes
 * with the license text; the font files themselves only carry the copyright
 * and a link to the license. public/licenses/ holds a copy of each font
 * package's LICENSE, and Vite copies it into the build next to the fonts
 * (fonts.css, top comment).
 *
 * @vitest-environment node
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Each font package fonts.css uses, and the copy of its license. */
const LICENSES: Record<string, string> = {
  "@fontsource-variable/geist": "public/licenses/Geist-OFL.txt",
  "@fontsource-variable/geist-mono": "public/licenses/GeistMono-OFL.txt",
};

/** The packages whose files fonts.css loads with url(). */
function fontPackages(): string[] {
  const css = readFileSync(join(appRoot, "src", "styles", "fonts.css"), "utf8");
  const packages = [...css.matchAll(/url\(\s*["']?(@[^/]+\/[^/]+)\//g)].map(
    (match) => match[1] ?? "",
  );
  return [...new Set(packages)];
}

describe("bundled fonts", () => {
  it("come from the font packages", () => {
    expect(fontPackages().sort()).toEqual(Object.keys(LICENSES).sort());
  });

  it.each(Object.entries(LICENSES))(
    "ship the license of %s unchanged",
    (pkg, copy) => {
      const original = join(appRoot, "node_modules", pkg, "LICENSE");
      expect(existsSync(original), `${pkg} should have a LICENSE`).toBe(true);
      expect(readFileSync(join(appRoot, copy), "utf8")).toBe(
        readFileSync(original, "utf8"),
      );
    },
  );
});

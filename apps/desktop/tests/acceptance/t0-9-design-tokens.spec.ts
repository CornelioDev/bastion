// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.9: "Apply the design tokens from
 * `docs/ui-stack.md` to the shadcn-vue theme; bundle Geist fonts locally."
 *
 * The roadmap gives no separate criteria; these come from the task line and
 * docs/ui-stack.md ("Design tokens", the contrast sentence below the table,
 * "Fonts: Geist and Geist Mono (bundled, OFL) | Tabular figures for the
 * timer; no network fetch at runtime", and `styles/tokens.css` in "Frontend
 * layout"), with the orchestrator's decisions for this task.
 *
 * How the tests look: they run the `vite build` step of `pnpm build` with
 * the project's own config into a temporary directory (as in
 * t0-8-dev-only-gallery.spec.ts) and read the CSS and font files it ships.
 * A second, CSS-only build compiles src/styles/main.css with
 * `@source inline(...)` listing the Tailwind utilities checked below, since
 * Tailwind only generates the utilities that the sources use. Colors are
 * compared by value, not by spelling: the build may write #FAFAF9 as
 * #fafaf9, rgb() or oklch(); one step per 8-bit channel is allowed for
 * rounding. Values are taken from the cascade on <html>: rules outside
 * `@media`, cascade layers and specificity respected, `var()` resolved.
 *
 * Contract the implementation must satisfy (the rest is free):
 *
 * 1. Tokens on the root element. In the light theme (<html> without the
 *    `dark` class) and in the dark theme (`dark` class on <html>, as in
 *    T-0.8), these custom properties have exactly these values:
 *
 *    | Property               | Light   | Dark    |
 *    |------------------------|---------|---------|
 *    | `--background`         | #FAFAF9 | #0C0C0E |
 *    | `--card`               | #FFFFFF | #16161A |
 *    | `--foreground`         | #18181B | #F4F4F5 |
 *    | `--muted-foreground`   | #71717A | #A1A1AA |
 *    | `--primary`            | #E5484D | #F2555A |
 *    | `--primary-foreground` | #18181B | #18181B |
 *    | `--break`              | #12A594 | #1FC7B1 |
 *    | `--strict`             | #F5A524 | #F7B955 |
 *    | `--strict-foreground`  | #18181B | #18181B |
 *    | `--border`             | #E4E4E7 | #27272A |
 *    | `--radius`             | 0.75rem | 0.75rem |
 *
 *    The colors are opaque. They are written in a notation the tests can
 *    read after the build (hex, rgb(), hsl(), oklch(), oklab(), lab(),
 *    lch(), color(srgb ...)), directly or through `var()`; not color-mix().
 *    Other shadcn-vue variables (popover, secondary, muted, accent, input,
 *    ring, destructive, sidebar-*, chart-*) are the developer's choice,
 *    taken from the MVP mockup for the dark theme and consistent with it
 *    for the light theme; the tests only check their contrast (rule 4).
 * 2. The dark theme is only the `dark` class: no token is set inside a
 *    `prefers-color-scheme` media query (following the OS is T-3.3).
 * 3. The tokens live in src/styles/tokens.css (docs/ui-stack.md, "Frontend
 *    layout"), which declares every property of the table.
 * 4. Text contrast is at least 4.5:1 (WCAG 2.2 AA, 1.4.3) in both themes
 *    for: foreground on background, card-foreground on card,
 *    popover-foreground on popover, muted-foreground on background and on
 *    card, primary-foreground on primary, secondary-foreground on
 *    secondary, accent-foreground on accent, strict-foreground on strict.
 *    A surface with alpha is painted over the background first.
 * 5. Tailwind color utilities exist for the new tokens and follow the
 *    theme: `bg-break`, `text-break`, `bg-strict`, `text-strict` and
 *    `text-strict-foreground` give the token's value in each theme, as
 *    `bg-primary` and `text-primary-foreground` do.
 * 6. Fonts are bundled: the shipped CSS has `@font-face` rules for Geist (a
 *    family name containing "Geist" but not "Mono") and for Geist Mono (a
 *    family name containing "Geist Mono" or "GeistMono"). Every `src` of
 *    those rules has at least one url(); every url() points to a file of
 *    the build itself (not http:, https:, //, data: or blob:) that exists
 *    and is a font file (WOFF2, WOFF, TrueType or OpenType).
 * 7. Geist is the document's default font (the first family of the
 *    `font-family` that <body> gets), and the first family of Tailwind's
 *    `font-sans` and `font-mono` utilities is the bundled Geist and Geist
 *    Mono respectively.
 * 8. Tabular figures for the timer: a bundled Geist file that covers the
 *    digits (by its `unicode-range`) has the OpenType `tnum` feature, so
 *    `tabular-nums` (`font-variant-numeric: tabular-nums`) takes effect.
 * 9. Nothing is fetched from the network: no built file mentions
 *    fonts.googleapis.com or fonts.gstatic.com, no built stylesheet has an
 *    `@import` or url() of an http(s): or protocol-relative URL, and
 *    index.html links no stylesheet or font from another origin.
 *
 * Out of scope, by the orchestrator's decision: the primary, break and
 * strict colors used as text on the light background do not reach 4.5:1
 * (3.75, 2.94 and 1.95); F3 adds text variants for them, so no test here
 * requires it. Generated src/components/ui/** stay as the shadcn-vue CLI
 * writes them (checked in validation, not here): tokens apply through CSS
 * variables only.
 *
 * Tests and the rules they cover:
 *
 * - "sets <token> to <value> in the <theme> theme": rule 1.
 * - "sets --radius to 0.75rem in the <theme> theme": rule 1.
 * - "switches the theme only with the dark class": rule 2.
 * - "keeps the design tokens in src/styles/tokens.css": rule 3.
 * - "keeps <text> on <surface> at 4.5:1 or more in the <theme> theme":
 *   rule 4.
 * - "gives <utility> the <token> color in the <theme> theme": rule 5.
 * - "declares Geist and Geist Mono with @font-face",
 *   "serves every font from the app's own files": rule 6.
 * - "uses Geist as the document's default font",
 *   "maps font-sans to Geist and font-mono to Geist Mono": rule 7.
 * - "bundles Geist with tabular figures": rule 8.
 * - "loads nothing from the network": rule 9.
 *
 * @vitest-environment node
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type Declaration,
  type Rgba,
  type Stylesheet,
  type Theme,
  bodyProperty,
  colorSchemeMediaProperties,
  composite,
  contrast,
  coversCodePoint,
  customProperty,
  fontFamilies,
  fontFormat,
  fontUrls,
  gsubFeatures,
  parseColor,
  parseStylesheet,
  resolveVars,
  ruleProperty,
  sameColor,
  toHex,
} from "./support/built-css.ts";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));

/** docs/ui-stack.md, "Design tokens", plus the text on primary and strict. */
const TOKENS: Record<Theme, Record<string, string>> = {
  light: {
    "--background": "#FAFAF9",
    "--card": "#FFFFFF",
    "--foreground": "#18181B",
    "--muted-foreground": "#71717A",
    "--primary": "#E5484D",
    "--primary-foreground": "#18181B",
    "--break": "#12A594",
    "--strict": "#F5A524",
    "--strict-foreground": "#18181B",
    "--border": "#E4E4E7",
  },
  dark: {
    "--background": "#0C0C0E",
    "--card": "#16161A",
    "--foreground": "#F4F4F5",
    "--muted-foreground": "#A1A1AA",
    "--primary": "#F2555A",
    "--primary-foreground": "#18181B",
    "--break": "#1FC7B1",
    "--strict": "#F7B955",
    "--strict-foreground": "#18181B",
    "--border": "#27272A",
  },
};

const THEMES: Theme[] = ["light", "dark"];

/** [text, surface] pairs that must reach 4.5:1. */
const CONTRAST_PAIRS: [string, string][] = [
  ["--foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--card"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--strict-foreground", "--strict"],
];

/** [utility class, CSS property, token] for rule 5. */
const UTILITIES: [string, string, string][] = [
  ["bg-break", "background-color", "--break"],
  ["text-break", "color", "--break"],
  ["bg-strict", "background-color", "--strict"],
  ["text-strict", "color", "--strict"],
  ["text-strict-foreground", "color", "--strict-foreground"],
  ["bg-primary", "background-color", "--primary"],
  ["text-primary-foreground", "color", "--primary-foreground"],
];

interface BuiltFile {
  /** Absolute path. */
  file: string;
  /** Path relative to the output directory, with forward slashes. */
  path: string;
}

let realOut: string;
let probeDir: string;
let probeOut: string;
let builtFiles: BuiltFile[];
/** The shipped stylesheets, in the order index.html loads them. */
let shipped: Stylesheet[];
/** The CSS-only build with the utilities of rule 5 and 7. */
let probe: Stylesheet[];

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

function expectSuccess(
  result: ReturnType<typeof spawnSync>,
  what: string,
): void {
  expect(
    result.status,
    `${what} should succeed:\n${String(result.stdout)}\n${String(result.stderr)}`,
  ).toBe(0);
}

function cssFiles(dir: string): string[] {
  return listFiles(dir).filter((file) => file.endsWith(".css"));
}

/** The stylesheets that index.html links, in order. */
function shippedStylesheets(): Stylesheet[] {
  const html = readFileSync(join(realOut, "index.html"), "utf8");
  const hrefs = [
    ...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi),
  ].map((match) => /href=["']?([^"' >]+)/i.exec(match[0])?.[1] ?? "");
  expect(hrefs.length, "index.html should link a stylesheet").toBeGreaterThan(
    0,
  );
  return hrefs.map((href) => {
    const file = join(realOut, href.replace(/^\.?\//, ""));
    expect(existsSync(file), `${href} should be in the build`).toBe(true);
    return parseStylesheet(readFileSync(file, "utf8"));
  });
}

beforeAll(() => {
  const vite = join(appRoot, "node_modules", "vite", "bin", "vite.js");

  // 1. The app as `pnpm build` ships it.
  realOut = mkdtempSync(join(tmpdir(), "bastion-t0-9-build-"));
  expectSuccess(
    spawnSync(
      process.execPath,
      [
        vite,
        "build",
        "--outDir",
        realOut,
        "--emptyOutDir",
        "--logLevel",
        "warn",
      ],
      { cwd: appRoot, env: productionEnv(), encoding: "utf8" },
    ),
    "vite build",
  );
  builtFiles = listFiles(realOut).map((file) => ({
    file,
    path: relative(realOut, file).split(sep).join("/"),
  }));
  shipped = shippedStylesheets();

  // 2. src/styles/main.css alone, with the utilities the tests look up.
  // The entry sits inside the app (node_modules/.tmp/, ignored by git) so
  // that it imports main.css by a relative path.
  const tmpRoot = join(appRoot, "node_modules", ".tmp");
  mkdirSync(tmpRoot, { recursive: true });
  probeDir = mkdtempSync(join(tmpRoot, "t0-9-probe-"));
  probeOut = join(probeDir, "out");
  const entry = join(probeDir, "probe.css");
  const mainCss = relative(probeDir, join(appRoot, "src", "styles", "main.css"))
    .split(sep)
    .join("/");
  const candidates = [
    ...UTILITIES.map(([utility]) => utility),
    "font-sans",
    "font-mono",
  ].join(" ");
  writeFileSync(
    entry,
    `@import "${mainCss}";\n@source inline("${candidates}");\n`,
  );
  const script = [
    'import { build } from "vite";',
    "await build({",
    "  root: process.env.PROBE_ROOT,",
    '  configFile: process.env.PROBE_ROOT + "/vite.config.ts",',
    '  mode: "production",',
    '  logLevel: "warn",',
    "  build: {",
    "    outDir: process.env.PROBE_OUT,",
    "    emptyOutDir: true,",
    "    rollupOptions: { input: { probe: process.env.PROBE_ENTRY } },",
    "  },",
    "});",
  ].join("\n");
  expectSuccess(
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: appRoot,
      env: {
        ...productionEnv(),
        PROBE_ROOT: appRoot,
        PROBE_OUT: probeOut,
        PROBE_ENTRY: entry,
      },
      encoding: "utf8",
    }),
    "the CSS-only build of src/styles/main.css",
  );
  const probeCss = cssFiles(probeOut);
  expect(probeCss.length, "the CSS-only build should emit CSS").toBe(1);
  probe = probeCss.map((file) => parseStylesheet(readFileSync(file, "utf8")));
}, 240_000);

afterAll(() => {
  if (realOut !== undefined) rmSync(realOut, { recursive: true, force: true });
  if (probeDir !== undefined) {
    rmSync(probeDir, { recursive: true, force: true });
  }
});

// --- Helpers --------------------------------------------------------------------

function tokenColor(sheets: Stylesheet[], theme: Theme, name: string): Rgba {
  const value = customProperty(sheets, theme, name);
  expect(value, `${name} should be set in the ${theme} theme`).toBeDefined();
  return parseColor(value ?? "");
}

function fontFaceValue(face: Declaration[], property: string): string {
  let value = "";
  for (const declaration of face) {
    if (declaration.property === property) value = declaration.value;
  }
  return value;
}

interface Face {
  family: string;
  src: string;
  unicodeRange: string | undefined;
  /** The CSS file the rule is in, to resolve relative URLs. */
  cssFile: string;
}

function shippedFaces(): Face[] {
  const faces: Face[] = [];
  for (const cssFile of cssFiles(realOut)) {
    const sheet = parseStylesheet(readFileSync(cssFile, "utf8"));
    for (const face of sheet.fontFaces) {
      const range = fontFaceValue(face, "unicode-range");
      faces.push({
        family: fontFamilies(fontFaceValue(face, "font-family"))[0] ?? "",
        src: fontFaceValue(face, "src"),
        unicodeRange: range === "" ? undefined : range,
        cssFile,
      });
    }
  }
  return faces;
}

const isGeistSans = (family: string): boolean =>
  /geist/i.test(family) && !/mono/i.test(family);
const isGeistMono = (family: string): boolean => /geist\s*mono/i.test(family);

/** The file a url() in `cssFile` points to, inside the build. */
function fontFile(url: string, cssFile: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  return path.startsWith("/")
    ? join(realOut, path)
    : join(dirname(cssFile), path);
}

const REMOTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

// --- Tests ------------------------------------------------------------------------

describe("design tokens (T-0.9)", () => {
  describe.each(THEMES)("in the %s theme", (theme) => {
    it.each(Object.entries(TOKENS[theme]))(
      `sets %s to %s in the ${theme} theme`,
      (name, expected) => {
        const actual = tokenColor(shipped, theme, name);
        expect(
          sameColor(actual, expected),
          `${name} is ${customProperty(shipped, theme, name) ?? "unset"} (${toHex(actual)}, alpha ${actual.a})`,
        ).toBe(true);
      },
    );

    it(`sets --radius to 0.75rem in the ${theme} theme`, () => {
      const value = customProperty(shipped, theme, "--radius") ?? "";
      expect(value, "--radius should be set").not.toBe("");
      const match = /^(\d*\.?\d+)rem$/.exec(value.trim());
      expect(match, `--radius is ${value}`).not.toBeNull();
      expect(Number.parseFloat(match?.[1] ?? "")).toBe(0.75);
    });

    it.each(CONTRAST_PAIRS)(
      `keeps %s on %s at 4.5:1 or more in the ${theme} theme`,
      (text, surface) => {
        const background = tokenColor(shipped, theme, "--background");
        expect(background.a, "--background should be opaque").toBeGreaterThan(
          0.999,
        );
        const under = composite(
          tokenColor(shipped, theme, surface),
          background,
        );
        const over = composite(tokenColor(shipped, theme, text), under);
        const ratio = contrast(over, under);
        expect(
          ratio,
          `${text} ${toHex(over)} on ${surface} ${toHex(under)} is ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      },
    );

    it.each(UTILITIES)(
      `gives %s the %s of %s in the ${theme} theme`,
      (utility, property, token) => {
        const value = ruleProperty(probe, `.${utility}`, property);
        expect(
          value,
          `Tailwind should generate .${utility} with ${property}`,
        ).toBeDefined();
        // Look variables up in the probe build, then in the shipped one.
        const sheets = [...shipped, ...probe];
        const actual = parseColor(resolveVars(sheets, theme, value ?? ""));
        const expected = TOKENS[theme][token] ?? "";
        expect(
          sameColor(actual, expected),
          `.${utility} gives ${toHex(actual)}, ${token} is ${expected}`,
        ).toBe(true);
      },
    );
  });

  it("switches the theme only with the dark class", () => {
    const tokens = Object.keys(TOKENS.light).concat("--radius");
    const inMedia = shipped
      .flatMap((sheet) => colorSchemeMediaProperties(sheet))
      .filter((property) => tokens.includes(property));
    expect(inMedia).toEqual([]);
  });

  it("keeps the design tokens in src/styles/tokens.css", () => {
    const file = join(appRoot, "src", "styles", "tokens.css");
    expect(existsSync(file), "src/styles/tokens.css should exist").toBe(true);
    const css = readFileSync(file, "utf8");
    const missing = Object.keys(TOKENS.light)
      .concat("--radius")
      .filter((name) => !new RegExp(`${name}\\s*:`).test(css));
    expect(missing, "tokens.css should declare every token").toEqual([]);
  });
});

describe("bundled fonts (T-0.9)", () => {
  it("declares Geist and Geist Mono with @font-face", () => {
    const families = shippedFaces().map((face) => face.family);
    expect(
      families.some(isGeistSans),
      `Geist should have @font-face rules (found: ${families.join(", ") || "none"})`,
    ).toBe(true);
    expect(
      families.some(isGeistMono),
      `Geist Mono should have @font-face rules (found: ${families.join(", ") || "none"})`,
    ).toBe(true);
  });

  it("serves every font from the app's own files", () => {
    const faces = shippedFaces().filter(
      (face) => isGeistSans(face.family) || isGeistMono(face.family),
    );
    expect(faces.length, "Geist should have @font-face rules").toBeGreaterThan(
      0,
    );
    const problems: string[] = [];
    for (const face of faces) {
      const urls = fontUrls(face.src);
      if (urls.length === 0) {
        problems.push(`${face.family}: no url() in src: ${face.src}`);
      }
      for (const url of urls) {
        if (REMOTE_URL.test(url)) {
          problems.push(
            `${face.family}: not a file of the app: ${url.slice(0, 60)}`,
          );
          continue;
        }
        const file = fontFile(url, face.cssFile);
        if (!existsSync(file)) {
          problems.push(`${face.family}: ${url} is not in the build`);
        } else if (fontFormat(readFileSync(file)) === null) {
          problems.push(`${face.family}: ${url} is not a font file`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("uses Geist as the document's default font", () => {
    const families = shippedFaces().map((face) => face.family);
    for (const theme of THEMES) {
      const value = bodyProperty(shipped, theme, "font-family") ?? "";
      const first = fontFamilies(value)[0] ?? "";
      expect(
        isGeistSans(first) && families.includes(first),
        `<body> gets font-family: ${value || "(none)"} in the ${theme} theme`,
      ).toBe(true);
    }
  });

  it("maps font-sans to Geist and font-mono to Geist Mono", () => {
    const families = shippedFaces().map((face) => face.family);
    const first = (utility: string): string => {
      const value = ruleProperty(probe, `.${utility}`, "font-family");
      expect(value, `Tailwind should generate .${utility}`).toBeDefined();
      return (
        fontFamilies(
          resolveVars([...shipped, ...probe], "light", value ?? ""),
        )[0] ?? ""
      );
    };
    const sans = first("font-sans");
    const mono = first("font-mono");
    expect(
      isGeistSans(sans) && families.includes(sans),
      `font-sans starts with ${sans}`,
    ).toBe(true);
    expect(
      isGeistMono(mono) && families.includes(mono),
      `font-mono starts with ${mono}`,
    ).toBe(true);
  });

  it("bundles Geist with tabular figures", () => {
    const digitFiles = shippedFaces()
      .filter(
        (face) =>
          isGeistSans(face.family) && coversCodePoint(face.unicodeRange, 0x30),
      )
      .flatMap((face) =>
        fontUrls(face.src)
          .filter((url) => !REMOTE_URL.test(url))
          .map((url) => fontFile(url, face.cssFile)),
      )
      .filter((file) => existsSync(file));
    expect(
      digitFiles.length,
      "a bundled Geist file should cover the digits",
    ).toBeGreaterThan(0);
    const withTnum = digitFiles.filter((file) =>
      gsubFeatures(readFileSync(file)).includes("tnum"),
    );
    expect(
      withTnum.length,
      "a bundled Geist file with digits should have the tnum feature",
    ).toBeGreaterThan(0);
  });

  it("loads nothing from the network", () => {
    const problems: string[] = [];
    for (const { file, path } of builtFiles) {
      if (!/\.(css|js|html)$/.test(path)) continue;
      const text = readFileSync(file, "utf8");
      if (/fonts\.(googleapis|gstatic)\.com/i.test(text)) {
        problems.push(`${path}: Google Fonts`);
      }
      if (path.endsWith(".css")) {
        const sheet = parseStylesheet(text);
        for (const target of sheet.imports) {
          if (
            /^(?:url\(\s*)?["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target)
          ) {
            problems.push(`${path}: @import ${target}`);
          }
        }
        for (const match of text.matchAll(
          /url\(\s*["']?\s*((?:https?:)?\/\/[^"')\s]*)/gi,
        )) {
          problems.push(`${path}: url(${match[1] ?? ""})`);
        }
      }
      if (path.endsWith(".html")) {
        for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
          if (/href=["']?\s*(?:https?:)?\/\//i.test(match[0])) {
            problems.push(`${path}: ${match[0]}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

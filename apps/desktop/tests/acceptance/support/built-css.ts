// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Helpers for acceptance tests that read the app's built stylesheet: a small
 * CSS parser, the cascade of custom properties on the root element (light
 * and dark themes), CSS color parsing, WCAG contrast, and font file checks.
 *
 * The parser covers what Tailwind CSS and Vite emit: style rules (also
 * nested), `@layer` (blocks and statements), `@media`, `@supports`,
 * `@font-face`, and skips other at-rules such as `@keyframes` and
 * `@property`. It is not a general CSS parser.
 */

import { brotliDecompressSync, inflateSync } from "node:zlib";

// --- Parsing -------------------------------------------------------------------

/** One declaration, in source order. */
export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

/** A style rule with the context it appears in. */
export interface StyleRule {
  selectors: string[];
  declarations: Declaration[];
  /** Full name of the cascade layer, or null when unlayered. */
  layer: string | null;
  /** Conditions of the `@media` rules around it (empty when none). */
  media: string[];
  /** Position in the stylesheet, for the cascade. */
  order: number;
}

/** A parsed stylesheet. */
export interface Stylesheet {
  rules: StyleRule[];
  fontFaces: Declaration[][];
  imports: string[];
  /** Layer names in the order they were first declared. */
  layerOrder: string[];
}

function stripComments(css: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const c = css.charAt(i);
    if (quote !== null) {
      out += c;
      if (c === "\\") {
        out += css.charAt(i + 1);
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
    } else if (c === "\\") {
      out += c + css.charAt(i + 1);
      i += 2;
    } else if (c === '"' || c === "'") {
      quote = c;
      out += c;
      i += 1;
    } else if (c === "/" && css.charAt(i + 1) === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Splits `text` at each top-level occurrence of `separator`, outside
 * strings, parentheses, brackets and braces.
 */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
    } else if (c === "\\") i += 1;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Index of the `}` that closes the block opened just before `from`. */
function blockEnd(css: string, from: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = from; i < css.length; i += 1) {
    const c = css.charAt(i);
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
    } else if (c === "\\") i += 1;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/** Index of the next top-level `{` or `;` from `from`, or -1. */
function preludeEnd(css: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < css.length; i += 1) {
    const c = css.charAt(i);
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
    } else if (c === "\\") i += 1;
    else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if ((c === "{" || c === ";") && depth === 0) return i;
  }
  return -1;
}

function parseDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const part of splitTopLevel(body, ";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const property = part.slice(0, colon).trim();
    let value = part.slice(colon + 1).trim();
    let important = false;
    const bang = /!\s*important\s*$/i.exec(value);
    if (bang !== null) {
      important = true;
      value = value.slice(0, bang.index).trim();
    }
    if (property !== "") declarations.push({ property, value, important });
  }
  return declarations;
}

interface Context {
  layer: string | null;
  media: string[];
  parentSelectors: string[] | null;
}

function combineSelectors(parents: string[] | null, own: string[]): string[] {
  if (parents === null) return own;
  return parents.flatMap((parent) =>
    own.map((selector) =>
      selector.includes("&")
        ? selector.split("&").join(parent)
        : `${parent} ${selector}`,
    ),
  );
}

/** Parses the CSS that Tailwind CSS and Vite emit. */
export function parseStylesheet(source: string): Stylesheet {
  const sheet: Stylesheet = {
    rules: [],
    fontFaces: [],
    imports: [],
    layerOrder: [],
  };
  let order = 0;
  let anonymousLayers = 0;

  const declareLayer = (name: string): void => {
    if (!sheet.layerOrder.includes(name)) sheet.layerOrder.push(name);
  };
  const layerName = (context: Context, name: string): string =>
    context.layer === null ? name : `${context.layer}.${name}`;

  /** Parses a block; returns the declarations directly inside it. */
  const parseBlock = (css: string, context: Context): Declaration[] => {
    let i = 0;
    const ownDeclarations: string[] = [];
    while (i < css.length) {
      const end = preludeEnd(css, i);
      if (end === -1) {
        ownDeclarations.push(css.slice(i));
        break;
      }
      const prelude = css.slice(i, end).trim();
      if (css.charAt(end) === ";") {
        if (/^@layer\s/i.test(prelude)) {
          for (const name of prelude.slice(6).split(",")) {
            declareLayer(layerName(context, name.trim()));
          }
        } else if (/^@import\s/i.test(prelude)) {
          sheet.imports.push(prelude.slice(7).trim());
        } else if (!prelude.startsWith("@")) {
          ownDeclarations.push(prelude);
        }
        i = end + 1;
        continue;
      }
      const close = blockEnd(css, end + 1);
      const body = css.slice(end + 1, close);
      i = close + 1;

      const atRule = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      if (atRule !== null) {
        const name = (atRule[1] ?? "").toLowerCase();
        const params = (atRule[2] ?? "").trim();
        if (name === "layer") {
          anonymousLayers += 1;
          const full = layerName(
            context,
            params === "" ? `<anonymous ${anonymousLayers}>` : params,
          );
          declareLayer(full);
          parseBlock(body, { ...context, layer: full });
        } else if (name === "media") {
          parseBlock(body, { ...context, media: [...context.media, params] });
        } else if (name === "supports" || name === "container") {
          parseBlock(body, context);
        } else if (name === "font-face") {
          sheet.fontFaces.push(parseDeclarations(body));
        }
        // @keyframes, @property, @page and others are not needed.
        continue;
      }

      const selectors = combineSelectors(
        context.parentSelectors,
        splitTopLevel(prelude, ",").map((selector) => selector.trim()),
      );
      order += 1;
      const rule: StyleRule = {
        selectors,
        declarations: [],
        layer: context.layer,
        media: context.media,
        order,
      };
      sheet.rules.push(rule);
      rule.declarations = parseBlock(body, {
        ...context,
        parentSelectors: selectors,
      });
    }
    return parseDeclarations(ownDeclarations.join(";"));
  };

  parseBlock(stripComments(source), {
    layer: null,
    media: [],
    parentSelectors: null,
  });
  return sheet;
}

// --- Cascade on the root element --------------------------------------------

/** The two themes: `dark` is the `dark` class on <html>. */
export type Theme = "light" | "dark";

/** Elements whose properties the tests look up. */
type Target = "root" | "body";

const ROOT_SELECTORS: Record<Theme, Map<string, number>> = {
  light: new Map([
    [":root", 10],
    ["html", 1],
    [":where(:root)", 0],
    [":where(html)", 0],
    ["*", 0],
  ]),
  dark: new Map([
    [":root", 10],
    ["html", 1],
    [":where(:root)", 0],
    [":where(html)", 0],
    ["*", 0],
    [".dark", 10],
    [":root.dark", 20],
    [".dark:root", 20],
    ["html.dark", 11],
    [":where(.dark)", 0],
    [":is(.dark)", 10],
  ]),
};

const BODY_SELECTORS: Record<Theme, Map<string, number>> = {
  light: new Map([
    ["body", 1],
    [":where(body)", 0],
    ["*", 0],
  ]),
  dark: new Map([
    ["body", 1],
    [":where(body)", 0],
    ["*", 0],
    [".dark body", 11],
    ["body.dark", 11],
    [".dark *", 10],
    ["*:is(.dark *)", 10],
    [":is(.dark *)", 10],
    ["body:is(.dark *)", 11],
  ]),
};

function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1");
}

interface Candidate {
  value: string;
  important: boolean;
  layerRank: number;
  specificity: number;
  order: number;
}

function layerRank(sheet: Stylesheet, layer: string | null): number {
  if (layer === null) return Number.MAX_SAFE_INTEGER;
  return sheet.layerOrder.indexOf(layer);
}

function compare(a: Candidate, b: Candidate): number {
  if (a.important !== b.important) return a.important ? 1 : -1;
  if (a.layerRank !== b.layerRank) {
    // Important declarations reverse the layer order.
    return a.important ? b.layerRank - a.layerRank : a.layerRank - b.layerRank;
  }
  if (a.specificity !== b.specificity) return a.specificity - b.specificity;
  return a.order - b.order;
}

/**
 * The value of `property` set directly on `target` (not inherited), by the
 * rules outside `@media` in `sheets` (later sheets come later in the
 * cascade), or undefined.
 */
function cascaded(
  sheets: Stylesheet[],
  target: Target,
  theme: Theme,
  property: string,
): string | undefined {
  const matching = (target === "root" ? ROOT_SELECTORS : BODY_SELECTORS)[theme];
  let best: Candidate | undefined;
  let offset = 0;
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      if (rule.media.length > 0) continue;
      let specificity = -1;
      for (const selector of rule.selectors) {
        const found = matching.get(normalizeSelector(selector));
        if (found !== undefined && found > specificity) specificity = found;
      }
      if (specificity < 0) continue;
      for (const declaration of rule.declarations) {
        if (declaration.property !== property) continue;
        const candidate: Candidate = {
          value: declaration.value,
          important: declaration.important,
          layerRank: layerRank(sheet, rule.layer),
          specificity,
          order: offset + rule.order,
        };
        if (best === undefined || compare(candidate, best) >= 0) {
          best = candidate;
        }
      }
    }
    offset += sheet.rules.length + 1;
  }
  return best?.value;
}

/** Resolves `var()` references in `value` against the root element. */
export function resolveVars(
  sheets: Stylesheet[],
  theme: Theme,
  value: string,
  depth = 0,
): string {
  if (depth > 20) throw new Error(`var() cycle or too deep: ${value}`);
  const start = value.indexOf("var(");
  if (start === -1) return value.trim();
  // Find the matching parenthesis.
  let level = 0;
  let end = -1;
  for (let i = start + 3; i < value.length; i += 1) {
    const c = value.charAt(i);
    if (c === "(") level += 1;
    else if (c === ")") {
      level -= 1;
      if (level === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced var() in ${value}`);
  const inner = value.slice(start + 4, end);
  const [name = "", ...rest] = splitTopLevel(inner, ",");
  const fallback = rest.length > 0 ? rest.join(",") : undefined;
  const defined = customProperty(sheets, theme, name.trim(), depth + 1);
  const replacement = defined ?? fallback;
  if (replacement === undefined) {
    throw new Error(`${name.trim()} is not defined (in ${value})`);
  }
  const replaced =
    value.slice(0, start) +
    resolveVars(sheets, theme, replacement, depth + 1) +
    value.slice(end + 1);
  return resolveVars(sheets, theme, replaced, depth + 1);
}

/**
 * The value of the custom property `name` on the root element in `theme`,
 * with `var()` resolved, or undefined when it is not set.
 */
export function customProperty(
  sheets: Stylesheet[],
  theme: Theme,
  name: string,
  depth = 0,
): string | undefined {
  const value = cascaded(sheets, "root", theme, name);
  return value === undefined
    ? undefined
    : resolveVars(sheets, theme, value, depth);
}

/**
 * The value of `property` on <body> in `theme`: its own, or inherited from
 * <html>, with `var()` resolved.
 */
export function bodyProperty(
  sheets: Stylesheet[],
  theme: Theme,
  property: string,
): string | undefined {
  const value =
    cascaded(sheets, "body", theme, property) ??
    cascaded(sheets, "root", theme, property);
  return value === undefined ? undefined : resolveVars(sheets, theme, value);
}

/** The last value of `property` in a rule whose only selector is `selector`. */
export function ruleProperty(
  sheets: Stylesheet[],
  selector: string,
  property: string,
): string | undefined {
  let found: string | undefined;
  for (const sheet of sheets) {
    for (const rule of sheet.rules) {
      if (rule.media.length > 0) continue;
      if (!rule.selectors.some((s) => normalizeSelector(s) === selector)) {
        continue;
      }
      for (const declaration of rule.declarations) {
        if (declaration.property === property) found = declaration.value;
      }
    }
  }
  return found;
}

/** Custom properties set by rules inside a `prefers-color-scheme` query. */
export function colorSchemeMediaProperties(sheet: Stylesheet): string[] {
  return sheet.rules
    .filter((rule) =>
      rule.media.some((media) => /prefers-color-scheme/i.test(media)),
    )
    .flatMap((rule) => rule.declarations.map((d) => d.property))
    .filter((property) => property.startsWith("--"));
}

// --- Colors ------------------------------------------------------------------------

/** An sRGB color, channels and alpha from 0 to 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, Rgba> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 1, g: 1, b: 1, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function number(text: string, percentScale = 1): number {
  const t = text.trim();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (Number.parseFloat(t) / 100) * percentScale;
  const n = Number.parseFloat(t);
  if (Number.isNaN(n)) throw new Error(`not a number: ${text}`);
  return n;
}

function hue(text: string): number {
  const t = text.trim();
  if (t === "none") return 0;
  if (t.endsWith("turn")) return Number.parseFloat(t) * 360;
  if (t.endsWith("rad")) return (Number.parseFloat(t) * 180) / Math.PI;
  if (t.endsWith("grad")) return Number.parseFloat(t) * 0.9;
  return Number.parseFloat(t);
}

/** Splits the arguments of a color function into channels and alpha. */
function channels(args: string): { values: string[]; alpha: number } {
  const [main = "", alpha] = args.split("/");
  const values = main.includes(",")
    ? main.split(",").map((v) => v.trim())
    : main.trim().split(/\s+/);
  let a = 1;
  if (alpha !== undefined) a = number(alpha, 1);
  else if (values.length === 4) a = number(values.pop() ?? "1", 1);
  return { values, alpha: a };
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function oklabToRgb(l: number, a: number, b: number, alpha: number): Rgba {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
    a: alpha,
  };
}

function labToRgb(l: number, a: number, b: number, alpha: number): Rgba {
  // CIE Lab (D50) to XYZ, Bradford-adapted to D65, then to linear sRGB.
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const x = (fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.96422;
  const y = l > k * e ? fy ** 3 : l / k;
  const z = (fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * 0.82521;
  const x65 = 0.9554734527 * x - 0.0230985368 * y + 0.0632593086 * z;
  const y65 = -0.0283697093 * x + 1.009995458 * y + 0.021041399 * z;
  const z65 = 0.0123140016 * x - 0.0205076964 * y + 1.3303659366 * z;
  return {
    r: linearToSrgb(
      3.2409699419 * x65 - 1.5373831776 * y65 - 0.4986107603 * z65,
    ),
    g: linearToSrgb(
      -0.9692436363 * x65 + 1.8759675015 * y65 + 0.0415550574 * z65,
    ),
    b: linearToSrgb(
      0.0556300797 * x65 - 0.2039769589 * y65 + 1.0569715142 * z65,
    ),
    a: alpha,
  };
}

function hslToRgb(h: number, s: number, l: number, alpha: number): Rgba {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4), a: alpha };
}

/**
 * Parses a CSS color: hex, rgb(), hsl(), oklch(), oklab(), lab(), lch(),
 * color(srgb …) or black/white/transparent. Throws on anything else, such
 * as color-mix(), with the value in the message.
 */
export function parseColor(value: string): Rgba {
  const v = value.trim().toLowerCase();
  const named = NAMED[v];
  if (named !== undefined) return named;
  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex !== null) {
    let digits = hex[1] ?? "";
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((d) => d + d).join("");
    }
    if (digits.length !== 6 && digits.length !== 8) {
      throw new Error(`invalid hex color: ${value}`);
    }
    const byte = (i: number): number =>
      Number.parseInt(digits.slice(i, i + 2), 16) / 255;
    return {
      r: byte(0),
      g: byte(2),
      b: byte(4),
      a: digits.length === 8 ? byte(6) : 1,
    };
  }
  const fn = /^([a-z]+)\((.*)\)$/.exec(v);
  if (fn === null) throw new Error(`unsupported color: ${value}`);
  const name = fn[1] ?? "";
  const { values, alpha } = channels(fn[2] ?? "");
  const [c1 = "0", c2 = "0", c3 = "0", c4 = "0"] = values;
  switch (name) {
    case "rgb":
    case "rgba":
      return {
        r: number(c1, 255) / 255,
        g: number(c2, 255) / 255,
        b: number(c3, 255) / 255,
        a: alpha,
      };
    case "hsl":
    case "hsla":
      return hslToRgb(
        hue(c1),
        number(c2, 100) / 100,
        number(c3, 100) / 100,
        alpha,
      );
    case "oklab":
      return oklabToRgb(number(c1, 1), number(c2, 0.4), number(c3, 0.4), alpha);
    case "oklch": {
      const l = number(c1, 1);
      const c = number(c2, 0.4);
      const h = (hue(c3) * Math.PI) / 180;
      return oklabToRgb(l, c * Math.cos(h), c * Math.sin(h), alpha);
    }
    case "lab":
      return labToRgb(number(c1, 100), number(c2, 125), number(c3, 125), alpha);
    case "lch": {
      const l = number(c1, 100);
      const c = number(c2, 150);
      const h = (hue(c3) * Math.PI) / 180;
      return labToRgb(l, c * Math.cos(h), c * Math.sin(h), alpha);
    }
    case "color": {
      if (c1 !== "srgb") throw new Error(`unsupported color space: ${value}`);
      return {
        r: number(c2, 1),
        g: number(c3, 1),
        b: number(c4, 1),
        a: alpha,
      };
    }
    default:
      throw new Error(`unsupported color: ${value}`);
  }
}

/** The color as #rrggbb (alpha ignored), for messages and comparisons. */
export function toHex(color: Rgba): string {
  const byte = (c: number): string =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}`.toUpperCase();
}

/**
 * Whether `actual` is the opaque color `expected` (#RRGGBB), allowing one
 * step per 8-bit channel for rounding in other notations such as oklch().
 */
export function sameColor(actual: Rgba, expected: string): boolean {
  const target = parseColor(expected);
  const step = (a: number, b: number): number =>
    Math.abs(Math.round(a * 255) - Math.round(b * 255));
  return (
    actual.a > 0.999 &&
    step(actual.r, target.r) <= 1 &&
    step(actual.g, target.g) <= 1 &&
    step(actual.b, target.b) <= 1
  );
}

/** `top` painted over the opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number): number => t * top.a + b * (1 - top.a);
  return {
    r: mix(top.r, bottom.r),
    g: mix(top.g, bottom.g),
    b: mix(top.b, bottom.b),
    a: 1,
  };
}

function luminance(color: Rgba): number {
  const lin = (c: number): number =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
}

/** WCAG 2.2 contrast ratio of two opaque colors. */
export function contrast(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Fonts ---------------------------------------------------------------------------

/** The family names in a `font-family` value, without quotes. */
export function fontFamilies(value: string): string[] {
  return splitTopLevel(value, ",")
    .map((family) => family.trim().replace(/^["']|["']$/g, ""))
    .filter((family) => family !== "");
}

/** The URLs in a `src` descriptor of `@font-face`. */
export function fontUrls(src: string): string[] {
  const urls: string[] = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi;
  for (const match of src.matchAll(pattern)) {
    urls.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return urls;
}

/** Whether a `unicode-range` value covers the code point. */
export function coversCodePoint(
  range: string | undefined,
  cp: number,
): boolean {
  if (range === undefined) return true;
  return range.split(",").some((part) => {
    const p = part.trim().toUpperCase().replace(/^U\+/, "");
    if (p.includes("?")) {
      const low = Number.parseInt(p.split("?").join("0"), 16);
      const high = Number.parseInt(p.split("?").join("F"), 16);
      return cp >= low && cp <= high;
    }
    const [low = "", high] = p.split("-");
    const lo = Number.parseInt(low, 16);
    const hi = high === undefined ? lo : Number.parseInt(high, 16);
    return cp >= lo && cp <= hi;
  });
}

/** The format of a font file from its first bytes, or null. */
export function fontFormat(data: Buffer): "woff2" | "woff" | "sfnt" | null {
  const tag = data.subarray(0, 4).toString("latin1");
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO" || tag === "true" || tag === "\u0000\u0001\u0000\u0000") {
    return "sfnt";
  }
  return null;
}

function readBase128(data: Buffer, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = data.readUInt8(offset + i);
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new Error("invalid UIntBase128");
}

const WOFF2_KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

/** The tables of a font file, decompressed, by tag. */
export function fontTables(data: Buffer): Map<string, Buffer> {
  const tables = new Map<string, Buffer>();
  const format = fontFormat(data);
  if (format === "sfnt") {
    const count = data.readUInt16BE(4);
    for (let i = 0; i < count; i += 1) {
      const entry = 12 + i * 16;
      const tag = data.subarray(entry, entry + 4).toString("latin1");
      const offset = data.readUInt32BE(entry + 8);
      const length = data.readUInt32BE(entry + 12);
      tables.set(tag, data.subarray(offset, offset + length));
    }
  } else if (format === "woff") {
    const count = data.readUInt16BE(12);
    for (let i = 0; i < count; i += 1) {
      const entry = 44 + i * 20;
      const tag = data.subarray(entry, entry + 4).toString("latin1");
      const offset = data.readUInt32BE(entry + 4);
      const compLength = data.readUInt32BE(entry + 8);
      const origLength = data.readUInt32BE(entry + 12);
      const raw = data.subarray(offset, offset + compLength);
      tables.set(tag, compLength < origLength ? inflateSync(raw) : raw);
    }
  } else if (format === "woff2") {
    const count = data.readUInt16BE(12);
    const compressedSize = data.readUInt32BE(20);
    let offset = 48;
    const entries: { tag: string; length: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const flags = data.readUInt8(offset);
      offset += 1;
      let tag = WOFF2_KNOWN_TAGS[flags & 0x3f] ?? "";
      if ((flags & 0x3f) === 0x3f) {
        tag = data.subarray(offset, offset + 4).toString("latin1");
        offset += 4;
      }
      const transform = (flags >> 6) & 0x03;
      let length: number;
      [length, offset] = readBase128(data, offset);
      const transformed =
        tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
      if (transformed) [length, offset] = readBase128(data, offset);
      entries.push({ tag, length });
    }
    const stream = brotliDecompressSync(
      data.subarray(offset, offset + compressedSize),
    );
    let position = 0;
    for (const { tag, length } of entries) {
      tables.set(tag, stream.subarray(position, position + length));
      position += length;
    }
  }
  return tables;
}

/** The OpenType feature tags in the font's GSUB table. */
export function gsubFeatures(data: Buffer): string[] {
  const gsub = fontTables(data).get("GSUB");
  if (gsub === undefined || gsub.length < 10) return [];
  const featureList = gsub.readUInt16BE(6);
  const count = gsub.readUInt16BE(featureList);
  const tags: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const record = featureList + 2 + i * 6;
    tags.push(gsub.subarray(record, record + 4).toString("latin1"));
  }
  return tags;
}

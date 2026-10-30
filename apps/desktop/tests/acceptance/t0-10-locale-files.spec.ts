// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.10: the app's translations, `en.json` and
 * `es.json` (docs/ui-stack.md, "Frontend layout": src/locales/), with no
 * missing translation and no message used without being defined
 * (ADR-0007: "Every UI change touches both locale files; CI checks for
 * missing keys").
 *
 * Contract (the rest is the developer's choice):
 *
 * 1. src/locales/en.json and src/locales/es.json exist, and each holds a
 *    JSON object of messages, possibly nested in objects (vue-i18n's
 *    format). A message is a non-empty string; there are no arrays,
 *    numbers, booleans or nulls.
 * 2. Both files have exactly the same message keys (dotted paths such as
 *    `app.name`), so no message is missing in either language.
 * 3. Every message key that the app's source code names literally exists
 *    in both locale files: the first argument of `t(...)`, `$t(...)` or
 *    `<something>.t(...)` when it is a string literal, and the `keypath`
 *    of `<i18n-t>`. All of src/ is searched except spec files. Keys built at runtime cannot be checked this way; the app
 *    tests (t0-10-i18n-app.spec.ts) fail on vue-i18n's missing-key
 *    warnings instead.
 *
 * The files do not need any particular message: the app has no screens yet
 * (T-0.10 adds no product copy).
 *
 * Tests and the rules they cover:
 *
 * - "has <locale>.json in src/locales with only non-empty messages": 1.
 * - "gives en.json and es.json the same message keys": 2.
 * - "defines every message key that the source code uses": 3.
 *
 * @vitest-environment node
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const localesDir = join(appRoot, "src", "locales");

const LOCALES = ["en", "es"] as const;

type Messages = Record<string, unknown>;

function readMessages(locale: string): Messages {
  const file = join(localesDir, `${locale}.json`);
  expect(existsSync(file), `src/locales/${locale}.json should exist`).toBe(
    true,
  );
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  expect(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    `src/locales/${locale}.json should hold a JSON object`,
  ).toBe(true);
  return parsed as Messages;
}

/** Every message of a locale file, as [dotted key, value]. */
function leafMessages(messages: Messages, prefix = ""): [string, unknown][] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? leafMessages(value as Messages, path)
      : [[path, value] as [string, unknown]];
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => /\.(vue|ts|tsx|js|mjs)$/.test(file))
    .filter((file) => !/\.spec\.[cm]?[jt]sx?$/.test(file));
}

/** Message keys named literally in `code`. */
function usedKeys(code: string): string[] {
  const patterns = [
    // t("key"), $t('key'), i18n.global.t(`key`): `t` is not the end of a
    // longer name such as `emit`.
    /(?<![\w$])\$?t\(\s*(["'`])([^"'`$]+?)\1/g,
    // <i18n-t keypath="key"> and <I18nT keypath="key">
    /\bkeypath=(["'])([^"']+?)\1/g,
  ];
  return patterns.flatMap((pattern) =>
    [...code.matchAll(pattern)].map((match) => match[2] ?? ""),
  );
}

describe("locale files (T-0.10)", () => {
  it.each(LOCALES)(
    "has %s.json in src/locales with only non-empty messages",
    (locale) => {
      const bad = leafMessages(readMessages(locale))
        .filter(([, value]) => typeof value !== "string" || value.trim() === "")
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);

      expect(bad, `messages of ${locale}.json that are not text`).toEqual([]);
    },
  );

  it("gives en.json and es.json the same message keys", () => {
    const en = new Set(leafMessages(readMessages("en")).map(([key]) => key));
    const es = new Set(leafMessages(readMessages("es")).map(([key]) => key));

    expect(
      [...en].filter((key) => !es.has(key)).sort(),
      "keys missing in es.json",
    ).toEqual([]);
    expect(
      [...es].filter((key) => !en.has(key)).sort(),
      "keys missing in en.json",
    ).toEqual([]);
  });

  it("defines every message key that the source code uses", () => {
    const defined = new Set(
      LOCALES.flatMap((locale) =>
        leafMessages(readMessages(locale)).map(([key]) => `${locale}:${key}`),
      ),
    );

    const missing = sourceFiles(join(appRoot, "src")).flatMap((file) => {
      const name = relative(appRoot, file).split(sep).join("/");
      return usedKeys(readFileSync(file, "utf8")).flatMap((key) =>
        LOCALES.filter((locale) => !defined.has(`${locale}:${key}`)).map(
          (locale) => `${name}: "${key}" is not in ${locale}.json`,
        ),
      );
    });

    expect(missing).toEqual([]);
  });
});

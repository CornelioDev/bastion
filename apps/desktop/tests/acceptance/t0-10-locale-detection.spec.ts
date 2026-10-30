// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.10, "locale detection from the OS": the function
 * that picks the app's locale from the user's preferred languages.
 *
 * The OS's languages reach the app through the webview: WebView2 takes
 * `navigator.languages` (and `navigator.language`) from Windows' language
 * settings. The app reads them at startup (t0-10-i18n-app.spec.ts); the
 * choice itself is a pure function, so that the language setting of a later
 * task (T-3.9) can call it too.
 *
 * Contract (the rest is the developer's choice):
 *
 * - The module `src/i18n` (a file `src/i18n.ts` or a folder
 *   `src/i18n/index.ts`) exports
 *   `detectLocale(languages: readonly string[]): "en" | "es"`.
 * - `languages` is a list of BCP 47 language tags in order of preference,
 *   as in `navigator.languages`. The result is the first tag whose primary
 *   language subtag (the part before the first `-`) is a supported locale,
 *   `en` or `es`, compared case-insensitively. When no tag matches,
 *   including an empty list, the result is `en`, the default locale.
 * - Only whole primary subtags match: `est` is not `es`.
 * - It decides from its argument only, not from `navigator`.
 *
 * Tests and what they cover:
 *
 * - "picks es for Spanish in any region": `es`, `es-ES`, `es-MX`, `es-419`.
 * - "picks en for English in any region": `en`, `en-US`, `en-GB`.
 * - "picks the first supported language in order of preference":
 *   `fr-FR, es-ES` gives `es`; `de-DE, en-US, es-ES` gives `en`.
 * - "falls back to en when no language is supported": unsupported tags and
 *   the empty list.
 * - "ignores the case of language tags".
 * - "matches whole primary language subtags only".
 * - "decides from the languages it is given, not from the browser".
 */

import { afterEach, describe, expect, it } from "vitest";

import { detectLocale } from "../../src/i18n";

afterEach(() => {
  // Undo the override in the last test.
  Reflect.deleteProperty(window.navigator, "languages");
  Reflect.deleteProperty(window.navigator, "language");
});

describe("locale detection (T-0.10)", () => {
  it.each([["es"], ["es-ES"], ["es-MX"], ["es-419"], ["es-US"]])(
    "picks es for Spanish in any region (%s)",
    (tag) => {
      expect(detectLocale([tag])).toBe("es");
    },
  );

  it.each([["en"], ["en-US"], ["en-GB"], ["en-IE"]])(
    "picks en for English in any region (%s)",
    (tag) => {
      expect(detectLocale([tag])).toBe("en");
    },
  );

  it.each([
    [["fr-FR", "es-ES"], "es"],
    [["de-DE", "en-US", "es-ES"], "en"],
    [["es-ES", "en-US"], "es"],
    [["en-US", "es-ES"], "en"],
    [["pt-BR", "fr-CA", "es-419", "en-GB"], "es"],
  ] as const)(
    "picks the first supported language in order of preference (%j)",
    (languages, expected) => {
      expect(detectLocale(languages)).toBe(expected);
    },
  );

  it.each([[["fr-FR"]], [["de-DE", "pt-BR", "ja"]], [[]]] as const)(
    "falls back to en when no language is supported (%j)",
    (languages) => {
      expect(detectLocale(languages)).toBe("en");
    },
  );

  it.each([
    [["ES-MX"], "es"],
    [["Es"], "es"],
    [["es-mx"], "es"],
    [["fr-FR", "ES-es"], "es"],
    [["EN-gb", "es-ES"], "en"],
  ] as const)(
    "ignores the case of language tags (%j)",
    (languages, expected) => {
      expect(detectLocale(languages)).toBe(expected);
    },
  );

  it.each([
    [["est"]],
    [["est-EE"]],
    [["e"]],
    [["esx-ES"]],
    [[""]],
    [["x-es"]],
  ] as const)(
    "matches whole primary language subtags only (%j)",
    (languages) => {
      // Each would give "es" with a prefix or substring match.
      expect(detectLocale(languages)).toBe("en");
    },
  );

  it("decides from the languages it is given, not from the browser", () => {
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      get: () => ["es-ES"],
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => "es-ES",
    });

    expect(detectLocale(["fr-FR"])).toBe("en");
    expect(detectLocale(["en-US"])).toBe("en");
  });
});

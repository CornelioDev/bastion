// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";
import { ref } from "vue";

import {
  createAppI18n,
  DEFAULT_LOCALE,
  detectLocale,
  preferredLanguages,
  SUPPORTED_LOCALES,
  syncDocumentLanguage,
  type Locale,
} from "./i18n";

// detectLocale() is covered by tests/acceptance/t0-10-locale-detection.spec.ts.

describe("preferredLanguages", () => {
  it("returns navigator.languages when it has any", () => {
    expect(
      preferredLanguages({ languages: ["es-MX", "en-US"], language: "fr-FR" }),
    ).toEqual(["es-MX", "en-US"]);
  });

  it("falls back to navigator.language when navigator.languages is empty", () => {
    expect(preferredLanguages({ languages: [], language: "es-ES" })).toEqual([
      "es-ES",
    ]);
  });
});

describe("createAppI18n", () => {
  it.each(SUPPORTED_LOCALES)(
    "starts in the locale it is given (%s)",
    (locale) => {
      const i18n = createAppI18n(locale);

      expect(i18n.global.locale.value).toBe(locale);
      expect(i18n.global.availableLocales).toEqual(
        expect.arrayContaining([...SUPPORTED_LOCALES]),
      );
    },
  );

  it("falls back to the default locale", () => {
    expect(createAppI18n("es").global.fallbackLocale.value).toBe(
      DEFAULT_LOCALE,
    );
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });

  it("translates in the active locale", () => {
    const i18n = createAppI18n("es");

    expect(i18n.global.t("app.name")).toBe("Keitora");
  });
});

describe("syncDocumentLanguage", () => {
  it("sets lang at once and follows the locale until stopped", () => {
    const root = document.createElement("html");
    root.lang = "fr";
    const locale = ref<Locale>("es");

    const stop = syncDocumentLanguage(locale, root);
    expect(root.lang).toBe("es");

    locale.value = "en";
    expect(root.lang).toBe("en");

    stop();
    locale.value = "es";
    expect(root.lang).toBe("en");
  });
});

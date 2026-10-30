// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Translations of the app's text (ADR-0007): English and Spanish, with
 * vue-i18n in Composition API mode. src/main.ts installs them; components
 * get their text with `const { t } = useI18n()` (CONTRIBUTING.md, "Adding
 * text to the app").
 */

import { watch, type Ref, type WatchHandle } from "vue";
import { createI18n } from "vue-i18n";

import en from "./locales/en.json";
import es from "./locales/es.json";

/** The locales the app has translations for, `en` first. */
export const SUPPORTED_LOCALES = ["en", "es"] as const;

/** A locale the app has translations for. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The locale used when none of the user's languages is supported, and the
 * one vue-i18n falls back to for a message missing in the active locale.
 */
export const DEFAULT_LOCALE: Locale = "en";

/** The shape of every locale file: the one of en.json. */
type MessageSchema = typeof en;

/**
 * Picks the app's locale from the user's preferred languages.
 *
 * `languages` holds BCP 47 language tags in order of preference, as in
 * `navigator.languages`. The result is the first tag whose primary language
 * subtag (the part before the first `-`, in any case) is a supported locale:
 * `es-MX` gives `es`, while `est` matches nothing. With no match, or no
 * languages at all, the result is {@link DEFAULT_LOCALE}.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = (tag.split("-", 1)[0] ?? "").toLowerCase();
    const match = SUPPORTED_LOCALES.find((locale) => locale === primary);
    if (match !== undefined) {
      return match;
    }
  }
  return DEFAULT_LOCALE;
}

/**
 * The user's preferred languages as the webview reports them, for
 * {@link detectLocale}. WebView2 takes them from Windows' language settings.
 * `navigator.languages` can be empty, in which case `navigator.language`,
 * the single most preferred one, is used.
 */
export function preferredLanguages(
  nav: Pick<Navigator, "languages" | "language">,
): readonly string[] {
  return nav.languages.length > 0 ? nav.languages : [nav.language];
}

/**
 * Creates the app's vue-i18n instance, starting in `locale`. The messages of
 * both locales are bundled with the app, so they are available at once and
 * nothing is fetched at runtime.
 */
export function createAppI18n(locale: Locale) {
  // `legacy: false` selects the Composition API (`useI18n()`); vue-i18n 11
  // deprecates the legacy API. The `[MessageSchema]` type argument makes
  // vue-tsc report a message that es.json is missing or has in another shape.
  return createI18n<[MessageSchema], Locale, false>({
    legacy: false,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages: { en, es },
  });
}

/**
 * Keeps the `lang` attribute of `root` (the document's `<html>` element)
 * equal to the active locale, so that screen readers pronounce the text in
 * the right language and the webview hyphenates and spell-checks it
 * accordingly. Returns a function that stops following the locale.
 */
export function syncDocumentLanguage(
  locale: Ref<Locale>,
  root: HTMLElement,
): WatchHandle {
  return watch(
    locale,
    (value) => {
      root.lang = value;
    },
    // `sync` updates the attribute as soon as the locale changes, not on
    // Vue's next render.
    { immediate: true, flush: "sync" },
  );
}

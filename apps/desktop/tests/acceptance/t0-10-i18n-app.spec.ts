// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.10: "Set up `vue-i18n` with `en.json` and
 * `es.json`, locale detection from the OS". These tests start the app the
 * way index.html does, by running src/main.ts, and check the vue-i18n
 * instance it installs and the document it leaves.
 *
 * How the tests start the app: a fresh module registry, a `<div id="app">`
 * in the document, `<html lang="en">` as in index.html, the preferred
 * languages set on `navigator.languages` and `navigator.language`, and
 * `import.meta.env.DEV` set to false so that App.vue renders what
 * production builds render, without the dev-only component gallery
 * (T-0.8). The tests then import src/main.ts and wait for pending promises.
 * They reach the app through `__vue_app__`, which Vue's `mount()` sets on
 * the container, and its i18n as the app's components do: a probe
 * component rendered with the app's context (`app._context`, part of Vue's
 * `App` type) calls `useI18n({ useScope: "global" })`.
 *
 * Contract (the rest is the developer's choice):
 *
 * 1. src/main.ts mounts the app on `#app` with vue-i18n installed in
 *    Composition API mode (`legacy: false`): a component of the app can
 *    call `useI18n()` and gets a composer whose `locale` is a ref, and
 *    starting logs no warning. (vue-i18n 11 also lets components call
 *    `useI18n()` in legacy mode, but then logs "Legacy API mode has been
 *    deprecated" at startup, which fails the test.)
 * 2. Locales: `en` and `es` are both available as soon as the app has
 *    started (the messages are bundled, not fetched), and `en` is the
 *    fallback locale.
 * 3. The starting locale comes from the webview's preferred languages:
 *    `navigator.languages`, or `[navigator.language]` when that list is
 *    empty, matched as `detectLocale` does (t0-10-locale-detection.spec.ts).
 * 4. `<html lang>` is the active locale ("en" or "es") once the app has
 *    started, and follows it when the locale changes later (the language
 *    setting of T-3.9 will change it).
 * 5. Every message of src/locales/en.json and es.json translates through
 *    the app's i18n in its locale, and starting and translating log no
 *    warning or error (vue-i18n warns about missing keys and broken
 *    messages). A message without vue-i18n syntax (`{`, `}`, `@`, `|`)
 *    translates to its own text.
 *
 * Tests and the rules they cover:
 *
 * - "installs vue-i18n in Composition API mode": rule 1.
 * - "bundles the en and es messages", "falls back to en": rule 2.
 * - "starts in <locale> when the preferred languages are <list>",
 *   "uses navigator.language when navigator.languages is empty": rule 3,
 *   and rule 4 for the starting locale.
 * - "keeps <html lang> in step with the active locale": rule 4.
 * - "translates every message of <locale> without warnings": rule 5.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "vue";
import type { Composer } from "vue-i18n";

// In the jsdom environment the global URL is jsdom's, which does not resolve
// file: URLs, so the path is built with Node.js' path functions.
const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type Messages = Record<string, unknown>;

interface Started {
  app: App;
  /** What `useI18n({ useScope: "global" })` gives a component of the app. */
  composer: Composer;
  /** Where the probe component is rendered. */
  probeHost: Element;
}

let started: Started | undefined;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

function setPreferredLanguages(
  languages: readonly string[],
  language: string,
): void {
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    get: () => Object.freeze([...languages]),
  });
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    get: () => language,
  });
}

/** Starts the app as index.html does, with these preferred languages. */
async function startApp(
  languages: readonly string[],
  language: string = languages[0] ?? "en-US",
): Promise<Started> {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  setPreferredLanguages(languages, language);
  document.documentElement.lang = "en";
  document.body.innerHTML = '<div id="app"></div>';

  await import("../../src/main.ts");
  await flushPromises();

  const container = document.querySelector("#app") as
    (Element & { __vue_app__?: App }) | null;
  const app = container?.__vue_app__;
  expect(app, "src/main.ts should mount the app on #app").toBeDefined();
  if (app === undefined) {
    throw new Error("the app was not mounted");
  }

  // The same module instances that src/main.ts loaded after the reset.
  const { createVNode, defineComponent, render } = await import("vue");
  const { useI18n } = await import("vue-i18n");
  let composer: Composer | undefined;
  let failure: unknown;
  const Probe = defineComponent({
    setup() {
      try {
        composer = useI18n({ useScope: "global" }) as unknown as Composer;
      } catch (caught) {
        failure = caught;
      }
      return () => null;
    },
  });
  const vnode = createVNode(Probe);
  vnode.appContext = app._context;
  const probeHost = document.createElement("div");
  render(vnode, probeHost);

  expect(
    failure,
    "a component of the app should be able to call useI18n()",
  ).toBeUndefined();
  if (composer === undefined) {
    throw new Error("useI18n() gave nothing");
  }

  started = { app, composer, probeHost };
  return started;
}

function readMessages(locale: string): Messages {
  const file = join(appRoot, "src", "locales", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Messages;
}

/** Every message of a locale file, as [dotted key, text]. */
function leafMessages(messages: Messages, prefix = ""): [string, unknown][] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? leafMessages(value as Messages, path)
      : [[path, value] as [string, unknown]];
  });
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function loggedProblems(): string[] {
  return [...warn.mock.calls, ...error.mock.calls].map((args) =>
    args.map(String).join(" "),
  );
}

beforeEach(() => {
  warn = vi.spyOn(console, "warn");
  error = vi.spyOn(console, "error");
});

afterEach(async () => {
  if (started !== undefined) {
    const { render } = await import("vue");
    render(null, started.probeHost);
    started.app.unmount();
  }
  started = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, "languages");
  Reflect.deleteProperty(window.navigator, "language");
  document.body.innerHTML = "";
  document.documentElement.lang = "en";
});

describe("vue-i18n in the app (T-0.10)", () => {
  it("installs vue-i18n in Composition API mode", async () => {
    const { composer } = await startApp(["en-US"]);
    const { isRef } = await import("vue");

    expect(isRef(composer.locale)).toBe(true);
    expect(loggedProblems()).toEqual([]);
  });

  it("bundles the en and es messages", async () => {
    const { composer } = await startApp(["en-US"]);

    expect(composer.availableLocales).toEqual(
      expect.arrayContaining(["en", "es"]),
    );
  });

  it("falls back to en", async () => {
    const { composer } = await startApp(["es-ES"]);

    expect(asList(composer.fallbackLocale.value)).toEqual(["en"]);
  });

  it.each([
    [["es-MX", "en-US"], "es"],
    [["es-419"], "es"],
    [["fr-FR", "es-ES"], "es"],
    [["en-GB", "es-ES"], "en"],
    [["en-US"], "en"],
    [["fr-FR", "de-DE"], "en"],
  ] as const)(
    "starts in the matching locale when the preferred languages are %j",
    async (languages, expected) => {
      const { composer } = await startApp(languages);

      expect(composer.locale.value).toBe(expected);
      expect(document.documentElement.lang).toBe(expected);
      expect(loggedProblems()).toEqual([]);
    },
  );

  it.each([
    ["es-ES", "es"],
    ["en-GB", "en"],
    ["fr-FR", "en"],
  ] as const)(
    "uses navigator.language when navigator.languages is empty (%s)",
    async (language, expected) => {
      const { composer } = await startApp([], language);

      expect(composer.locale.value).toBe(expected);
      expect(document.documentElement.lang).toBe(expected);
    },
  );

  it("keeps <html lang> in step with the active locale", async () => {
    const { app, composer } = await startApp(["es-ES"]);
    const { nextTick } = await import("vue");
    expect(document.documentElement.lang).toBe("es");

    composer.locale.value = "en";
    await nextTick();
    expect(document.documentElement.lang).toBe("en");

    composer.locale.value = "es";
    await nextTick();
    expect(document.documentElement.lang).toBe("es");

    // The app is still the one running.
    expect(
      (document.querySelector("#app") as Element & { __vue_app__?: App })
        .__vue_app__,
    ).toBe(app);
  });

  it.each([
    ["en", ["en-US"]],
    ["es", ["es-ES"]],
  ] as const)(
    "translates every message of %s without warnings",
    async (locale, languages) => {
      const { composer } = await startApp(languages);
      expect(composer.locale.value).toBe(locale);

      for (const [key, text] of leafMessages(readMessages(locale))) {
        expect(composer.te(key, locale), `${locale}: ${key}`).toBe(true);
        const translated = composer.t(key);
        expect(typeof translated, `${locale}: ${key}`).toBe("string");
        if (typeof text === "string" && !/[{}@|]/.test(text)) {
          expect(translated, `${locale}: ${key}`).toBe(text);
        }
      }

      expect(loggedProblems()).toEqual([]);
    },
  );
});

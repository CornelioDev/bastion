// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.8: Tailwind CSS v4 and shadcn-vue are set up, the
 * components listed in docs/ui-stack.md are installed, and "a dev-only page
 * renders all components in light and dark themes".
 *
 * This file covers "renders all components in light and dark themes". The
 * "dev-only" half, and Tailwind CSS v4 in the built stylesheet, are covered
 * by t0-8-dev-only-gallery.spec.ts.
 *
 * Contract the implementation must satisfy (the rest of the design is free):
 *
 * 1. The gallery is the single-file component src/dev/ComponentGallery.vue
 *    (default export). It mounts with Vue Test Utils' `mount()` with no
 *    props and no global plugins (no router, Pinia or i18n needed).
 * 2. Every component listed in docs/ui-stack.md is installed with the
 *    shadcn-vue CLI under src/components/ui/<name>/, with an index.ts that
 *    exports its parts (the CLI's standard layout).
 * 3. For every listed component, the gallery has an element with
 *    `data-gallery-component="<name>"` (for example
 *    `data-gallery-component="alert-dialog"`), and inside it renders at least
 *    one component exported by src/components/ui/<name>/index.ts.
 * 4. The theme is the `dark` class on the document's root element (<html>),
 *    as shadcn-vue expects. The gallery has a control marked
 *    `data-gallery-theme-toggle`; clicking that element switches the class
 *    on and off. The gallery may start in either theme.
 * 5. Overlays open from the trigger inside their section, the way a
 *    keyboard or mouse user would open them:
 *    - dialog: click on the `DialogTrigger` → a `role="dialog"` element with
 *      the `DialogContent` component.
 *    - alert-dialog: click on the `AlertDialogTrigger` → a
 *      `role="alertdialog"` element with the `AlertDialogContent` component.
 *    - select: Enter on the `SelectTrigger` → a `role="listbox"` element
 *      with the `SelectContent` component and at least one option.
 *    - dropdown-menu: Enter on the `DropdownMenuTrigger` → a `role="menu"`
 *      element with the `DropdownMenuContent` component and at least one
 *      menu item.
 *    - tooltip: focus on the `TooltipTrigger` → a `role="tooltip"` element
 *      with the `TooltipContent` component.
 *    - sonner: the `Toaster` is mounted inside the sonner section; a toast
 *      raised with `toast()` from vue-sonner (shadcn-vue's Sonner) shows its
 *      text in the document.
 *    `command` is not an overlay: it counts as rendered under rule 3.
 * 6. Mounting the gallery and opening its overlays logs nothing on
 *    console.warn or console.error (checked after every test). This
 *    catches Vue warnings (unresolved components, missing providers such as
 *    TooltipProvider, SidebarProvider or FormField) and reka-ui's
 *    accessibility warnings, such as a dialog without a title.
 * 7. The open dialog and alert dialog have an accessible name, from their
 *    title (WCAG 2.2 AA, success criterion 4.1.2).
 *
 * Decided by the maintainer for this task: the gallery is a developer tool,
 * not a user-facing screen, and is stripped from production builds, so it
 * may use literal sample strings (T-0.10's lint rule against raw strings
 * will exempt it). Design tokens and fonts are T-0.9, so no test here checks
 * colors or fonts; jsdom does not apply the stylesheet anyway.
 *
 * Tests, each run once in the light theme and once in the dark theme:
 *
 * - "renders the <name> section with its shadcn-vue component": rules 2
 *   and 3, one test per component.
 * - "opens the dialog", "opens the alert dialog": rules 5 and 7.
 * - "opens the select", "opens the dropdown menu", "shows the tooltip",
 *   "shows a toast": rule 5.
 * - every test: rule 6.
 *
 * And once:
 *
 * - "switches the document between the light and dark themes": rule 4.
 *
 * jsdom lacks some browser APIs that the WebView2 runtime has and that
 * reka-ui, VueUse and Unovis call (ResizeObserver, matchMedia, pointer
 * capture, scrollIntoView, SVG measurement, a 2D canvas context). The test
 * adds minimal stand-ins for those before it loads the gallery; the gallery
 * does not need to work around jsdom itself.
 *
 * jsdom does not apply stylesheets, so the dark-theme run proves that the
 * gallery is switched to the dark theme with its own toggle and that every
 * component and overlay still renders there, with portalled overlays under
 * the same <html class="dark">. That the stylesheet styles `.dark` is
 * checked on the production build (t0-8-dev-only-gallery.spec.ts); how it
 * looks is the maintainer's manual check.
 */

import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { toast } from "vue-sonner";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type { Component } from "vue";

/** The components listed in docs/ui-stack.md, "shadcn-vue components used". */
const COMPONENTS = [
  "button",
  "card",
  "input",
  "label",
  "switch",
  "select",
  "dialog",
  "alert-dialog",
  "tabs",
  "badge",
  "separator",
  "tooltip",
  "sonner",
  "scroll-area",
  "dropdown-menu",
  "command",
  "form",
  "number-field",
  "chart",
  "sidebar",
] as const;

type ComponentName = (typeof COMPONENTS)[number];
type Theme = "light" | "dark";

const GALLERY_PATH = "../../src/dev/ComponentGallery.vue";

// Found through import.meta.glob so that a missing file fails the tests that
// need it, with a message naming the file, instead of the whole file. They
// are loaded in `beforeAll`, after the jsdom stand-ins below are in place,
// because some libraries look for browser APIs when they are first imported.
const galleryLoaders = import.meta.glob<{ default: Component }>(
  "../../src/dev/ComponentGallery.vue",
);
const uiLoaders = import.meta.glob<Record<string, unknown>>(
  "../../src/components/ui/*/index.ts",
);
const galleryModules: Record<string, { default: Component }> = {};
const uiModules: Record<string, Record<string, unknown>> = {};

async function loadModules(): Promise<void> {
  for (const [path, load] of Object.entries(galleryLoaders)) {
    galleryModules[path] = await load();
  }
  for (const [path, load] of Object.entries(uiLoaders)) {
    uiModules[path] = await load();
  }
}

function gallery(): Component {
  const module = galleryModules[GALLERY_PATH];
  expect(
    module,
    "src/dev/ComponentGallery.vue should exist and export a component",
  ).toBeDefined();
  return module.default;
}

function uiModule(name: ComponentName): Record<string, unknown> {
  const module = uiModules[`../../src/components/ui/${name}/index.ts`];
  expect(
    module,
    `src/components/ui/${name}/index.ts should exist (shadcn-vue CLI)`,
  ).toBeDefined();
  return module;
}

function isComponent(value: unknown): value is Component {
  return (
    typeof value === "object" &&
    value !== null &&
    ("setup" in value || "render" in value || "__name" in value)
  );
}

/** Every Vue component exported by src/components/ui/<name>/index.ts. */
function uiComponents(name: ComponentName): Component[] {
  const components = Object.values(uiModule(name)).filter(isComponent);
  expect(
    components.length,
    `src/components/ui/${name}/index.ts should export at least one component`,
  ).toBeGreaterThan(0);
  return components;
}

/** One named export of src/components/ui/<name>/index.ts. */
function uiPart(name: ComponentName, part: string): Component {
  const value = uiModule(name)[part];
  expect(
    isComponent(value),
    `src/components/ui/${name}/index.ts should export the ${part} component`,
  ).toBe(true);
  return value as Component;
}

// --- jsdom stand-ins for browser APIs that WebView2 provides -------------

function defineIfMissing(target: object, key: string, value: unknown): void {
  if (!(key in target)) {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

function addBrowserApis(): void {
  class ResizeObserverStandIn {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  defineIfMissing(globalThis, "ResizeObserver", ResizeObserverStandIn);
  defineIfMissing(window, "matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  defineIfMissing(Element.prototype, "scrollIntoView", () => {});
  defineIfMissing(Element.prototype, "hasPointerCapture", () => false);
  defineIfMissing(Element.prototype, "setPointerCapture", () => {});
  defineIfMissing(Element.prototype, "releasePointerCapture", () => {});
  defineIfMissing(SVGElement.prototype, "getBBox", () => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }));
  defineIfMissing(SVGElement.prototype, "getComputedTextLength", () => 0);
  // jsdom has getContext() but only logs "Not implemented" on
  // console.error. Without a 2D context, as in a browser that cannot create
  // one, chart libraries fall back to estimating text sizes.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: () => null,
  });
}

// --- Mounting and theme ----------------------------------------------------

let wrapper: VueWrapper | undefined;
let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function themeToggle(mounted: VueWrapper) {
  const toggle = mounted.find("[data-gallery-theme-toggle]");
  expect(
    toggle.exists(),
    "the gallery should have a control marked data-gallery-theme-toggle",
  ).toBe(true);
  return toggle;
}

/** Mounts the gallery and switches it to `theme` with its own toggle. */
async function mountGallery(theme: Theme): Promise<VueWrapper> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  wrapper = mount(gallery(), { attachTo: host });
  await flushPromises();

  if (isDark() !== (theme === "dark")) {
    await themeToggle(wrapper).trigger("click");
    await flushPromises();
  }
  expect(isDark(), `the gallery should be in the ${theme} theme`).toBe(
    theme === "dark",
  );
  return wrapper;
}

function section(mounted: VueWrapper, name: ComponentName) {
  const found = mounted.find(`[data-gallery-component="${name}"]`);
  expect(
    found.exists(),
    `the gallery should have an element with data-gallery-component="${name}"`,
  ).toBe(true);
  return found;
}

/** Mounted instances of `component` whose element is inside the section. */
function findInSection(
  mounted: VueWrapper,
  name: ComponentName,
  component: Component,
): VueWrapper[] {
  const container = section(mounted, name).element;
  return mounted
    .findAllComponents(component)
    .filter((found) => container.contains(found.element));
}

function triggerIn(
  mounted: VueWrapper,
  name: ComponentName,
  part: string,
): VueWrapper {
  const triggers = findInSection(mounted, name, uiPart(name, part));
  expect(
    triggers.length,
    `the ${name} section should contain a ${part}`,
  ).toBeGreaterThan(0);
  return triggers[0];
}

/** Waits until `selector` matches an element in the document. */
async function waitForElement(selector: string): Promise<Element> {
  return vi.waitFor(
    () => {
      const found = document.querySelector(selector);
      if (found === null) {
        throw new Error(`no element matches ${selector}`);
      }
      return found;
    },
    { timeout: 3000, interval: 50 },
  );
}

function expectMounted(
  mounted: VueWrapper,
  name: ComponentName,
  part: string,
): void {
  expect(
    mounted.findAllComponents(uiPart(name, part)).length,
    `${part} should be mounted once the ${name} is open`,
  ).toBeGreaterThan(0);
}

/** Fails unless `dialog` has an accessible name (WCAG 2.2, 4.1.2). */
function expectAccessibleName(dialog: Element): void {
  const label = dialog.getAttribute("aria-label")?.trim() ?? "";
  const labelledBy = (dialog.getAttribute("aria-labelledby") ?? "")
    .split(/s+/)
    .filter((id) => id !== "")
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ")
    .trim();
  expect(
    label !== "" || labelledBy !== "",
    `the ${dialog.getAttribute("role")} should have an accessible name (a title)`,
  ).toBe(true);
}

beforeAll(async () => {
  addBrowserApis();
  await loadModules();
});

beforeEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  warn = vi.spyOn(console, "warn");
  error = vi.spyOn(console, "error");
});

afterEach(async () => {
  toast.dismiss();
  wrapper?.unmount();
  wrapper = undefined;
  await flushPromises();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("dark");

  const warnings = warn.mock.calls;
  const errors = error.mock.calls;
  warn.mockRestore();
  error.mockRestore();
  expect(warnings, "the gallery should log nothing on console.warn").toEqual(
    [],
  );
  expect(errors, "the gallery should log nothing on console.error").toEqual([]);
});

// --- Tests -------------------------------------------------------------------

describe("component gallery (T-0.8)", () => {
  it("switches the document between the light and dark themes", async () => {
    const mounted = await mountGallery("light");

    await themeToggle(mounted).trigger("click");
    await flushPromises();
    expect(isDark()).toBe(true);

    await themeToggle(mounted).trigger("click");
    await flushPromises();
    expect(isDark()).toBe(false);
  });

  describe.each<Theme>(["light", "dark"])("in the %s theme", (theme) => {
    it.each(COMPONENTS)(
      "renders the %s section with its shadcn-vue component",
      async (name) => {
        const mounted = await mountGallery(theme);
        const components = uiComponents(name);

        const rendered = components.flatMap((component) =>
          findInSection(mounted, name, component),
        );

        expect(
          rendered.length,
          `the ${name} section should render a component from src/components/ui/${name}`,
        ).toBeGreaterThan(0);
      },
    );

    it("opens the dialog", async () => {
      const mounted = await mountGallery(theme);

      await triggerIn(mounted, "dialog", "DialogTrigger").trigger("click");

      expectAccessibleName(await waitForElement('[role="dialog"]'));
      expectMounted(mounted, "dialog", "DialogContent");
      expect(isDark()).toBe(theme === "dark");
    });

    it("opens the alert dialog", async () => {
      const mounted = await mountGallery(theme);

      await triggerIn(mounted, "alert-dialog", "AlertDialogTrigger").trigger(
        "click",
      );

      expectAccessibleName(await waitForElement('[role="alertdialog"]'));
      expectMounted(mounted, "alert-dialog", "AlertDialogContent");
      expect(isDark()).toBe(theme === "dark");
    });

    it("opens the select", async () => {
      const mounted = await mountGallery(theme);

      await triggerIn(mounted, "select", "SelectTrigger").trigger("keydown", {
        key: "Enter",
      });

      const listbox = await waitForElement('[role="listbox"]');
      expect(listbox.querySelector('[role="option"]')).not.toBeNull();
      expectMounted(mounted, "select", "SelectContent");
      expect(isDark()).toBe(theme === "dark");
    });

    it("opens the dropdown menu", async () => {
      const mounted = await mountGallery(theme);

      await triggerIn(mounted, "dropdown-menu", "DropdownMenuTrigger").trigger(
        "keydown",
        { key: "Enter" },
      );

      const menu = await waitForElement('[role="menu"]');
      expect(menu.querySelector('[role^="menuitem"]')).not.toBeNull();
      expectMounted(mounted, "dropdown-menu", "DropdownMenuContent");
      expect(isDark()).toBe(theme === "dark");
    });

    it("shows the tooltip", async () => {
      const mounted = await mountGallery(theme);

      await triggerIn(mounted, "tooltip", "TooltipTrigger").trigger("focus");

      await waitForElement('[role="tooltip"]');
      expectMounted(mounted, "tooltip", "TooltipContent");
      expect(isDark()).toBe(theme === "dark");
    });

    it("shows a toast", async () => {
      const mounted = await mountGallery(theme);
      expect(
        findInSection(mounted, "sonner", uiPart("sonner", "Toaster")).length,
        "the sonner section should mount the Toaster",
      ).toBeGreaterThan(0);
      const message = `Acceptance toast (${theme})`;

      toast(message);

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain(message);
        },
        { timeout: 3000, interval: 50 },
      );
      expect(isDark()).toBe(theme === "dark");
    });
  });
});

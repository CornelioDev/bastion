// SPDX-License-Identifier: MIT OR Apache-2.0

import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { h } from "vue";

import App from "./App.vue";

// The real gallery is covered by the T-0.8 acceptance tests; a stand-in
// keeps this test about App.vue alone.
vi.mock("./dev/ComponentGallery.vue", () => ({
  // Tells defineAsyncComponent() to take the default export.
  __esModule: true,
  default: { render: () => h("p", { "data-test": "gallery" }) },
}));

describe("App", () => {
  it("shows the component gallery in development builds", async () => {
    // Vitest builds like `vite dev`: `import.meta.env.DEV` is true.
    expect(import.meta.env.DEV).toBe(true);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('[data-test="gallery"]').exists()).toBe(true);
  });
});

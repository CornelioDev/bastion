// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Acceptance tests for T-0.7: Vitest + Vue Test Utils can test Vue
 * components.
 *
 * Criterion covered by every test in this file: `pnpm test` runs Vitest,
 * which compiles single-file components written with `<script setup
 * lang="ts">` and mounts them with Vue Test Utils in a DOM environment. The
 * file sets no `@vitest-environment`: component tests must work with the
 * project's default Vitest configuration.
 *
 * - "mounts a TypeScript single-file component and renders its props":
 *   SFC compilation, TypeScript in `<script setup>`, mounting, rendering.
 * - "applies a prop's default value when the prop is omitted": typed props
 *   with `withDefaults`.
 * - "re-renders when a click changes the component's state": DOM events
 *   and reactivity.
 * - "emits a typed event when the component's state changes": emitted
 *   events are visible to the test.
 *
 * The component under test is a fixture (fixtures/ClickCounter.vue) rather
 * than App.vue, so that later tasks can change App.vue freely.
 */

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ClickCounter from "./fixtures/ClickCounter.vue";

describe("component tests (T-0.7)", () => {
  it("mounts a TypeScript single-file component and renders its props", () => {
    const wrapper = mount(ClickCounter, {
      props: { label: "Sessions", start: 3 },
    });

    expect(wrapper.get('[data-test="label"]').text()).toBe("Sessions");
    expect(wrapper.get('[data-test="count"]').text()).toBe("3");
  });

  it("applies a prop's default value when the prop is omitted", () => {
    const wrapper = mount(ClickCounter, { props: { label: "Sessions" } });

    expect(wrapper.get('[data-test="count"]').text()).toBe("0");
  });

  it("re-renders when a click changes the component's state", async () => {
    const wrapper = mount(ClickCounter, { props: { label: "Sessions" } });

    await wrapper.get("button").trigger("click");
    await wrapper.get("button").trigger("click");

    expect(wrapper.get('[data-test="count"]').text()).toBe("2");
  });

  it("emits a typed event when the component's state changes", async () => {
    const wrapper = mount(ClickCounter, {
      props: { label: "Sessions", start: 4 },
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("changed")).toEqual([[5]]);
  });
});

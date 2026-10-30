<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->

<!--
  Test-only component for the T-0.7 acceptance tests
  (tests/acceptance/t0-7-component-tests.spec.ts). It uses the parts of a
  single-file component that the test pipeline must handle: `<script setup
  lang="ts">`, typed props with a default, typed emits, reactive state and a
  template event handler. It is not part of the app.
-->
<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(defineProps<{ label: string; start?: number }>(), {
  start: 0,
});

const emit = defineEmits<{ changed: [count: number] }>();

const count = ref(props.start);

function increment(): void {
  count.value += 1;
  emit("changed", count.value);
}
</script>

<template>
  <button type="button" @click="increment">
    <span data-test="label">{{ label }}</span>
    <span data-test="count">{{ count }}</span>
  </button>
</template>

<!-- SPDX-License-Identifier: MIT OR Apache-2.0 -->

<!--
  Root component. The app has no screens yet: the layout, routing and screens
  described in docs/ui-stack.md replace this in later tasks.

  Until then, development builds (`pnpm tauri dev`, `pnpm dev`) show the
  component gallery (src/dev/ComponentGallery.vue), since the window has no
  address bar to open it with. Production builds replace
  `import.meta.env.DEV` with `false` and drop the dead branch, so the gallery
  and its import are left out and the window stays empty.
-->
<script setup lang="ts">
import { defineAsyncComponent } from "vue";

const devPage = import.meta.env.DEV
  ? defineAsyncComponent(() => import("./dev/ComponentGallery.vue"))
  : undefined;
</script>

<template>
  <component :is="devPage" v-if="devPage" />
  <main v-else></main>
</template>

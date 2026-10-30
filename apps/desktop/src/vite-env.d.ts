// SPDX-License-Identifier: MIT OR Apache-2.0

/// <reference types="vite/client" />

// Lets TypeScript tools that do not understand single-file components resolve
// `.vue` imports. vue-tsc reads the components themselves and ignores this.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

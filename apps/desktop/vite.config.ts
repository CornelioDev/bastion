// SPDX-License-Identifier: MIT OR Apache-2.0

import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  // Tailwind CSS v4 builds the stylesheet from the classes used in the
  // source files (src/styles/main.css is its entry point).
  plugins: [vue(), tailwindcss()],

  // vue-i18n's compile-time feature flags, set here so that the bundler
  // drops the code the app does not use. See
  // https://vue-i18n.intlify.dev/guide/advanced/optimization.html
  define: {
    // The app uses the Composition API only (`legacy: false` in src/i18n.ts).
    __VUE_I18N_LEGACY_API__: false,
    // Registers `<i18n-t>`, `<i18n-n>`, `<i18n-d>` and `v-t` globally, for
    // text with components inside it.
    __VUE_I18N_FULL_INSTALL__: true,
    // Keeps the message compiler: the messages are plain JSON, compiled when
    // first used. It builds them into data, not code, so it works under the
    // app's Content Security Policy, which forbids evaluating strings.
    __INTLIFY_DROP_MESSAGE_COMPILER__: false,
    // No devtools hooks in production builds.
    __INTLIFY_PROD_DEVTOOLS__: false,
  },

  resolve: {
    // `@/` is `src/`, the import path that shadcn-vue's components use
    // (components.json). The tsconfigs map it the same way for TypeScript.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Options for Tauri, applied in `tauri dev` and `tauri build`.
  // Keep Rust compile errors visible in the terminal.
  clearScreen: false,
  server: {
    // Only reachable from this machine. Tauri loads the app from the
    // `devUrl` in src-tauri/tauri.conf.json, which must match these two.
    host: "localhost",
    // Tauri expects a fixed port, so fail if it is taken instead of moving on.
    port: 1420,
    strictPort: true,
    watch: {
      // Cargo rebuilds the Rust side; Vite does not need to watch it.
      ignored: ["**/src-tauri/**"],
    },
  },
});

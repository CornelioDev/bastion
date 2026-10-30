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

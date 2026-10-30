// SPDX-License-Identifier: MIT OR Apache-2.0

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

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

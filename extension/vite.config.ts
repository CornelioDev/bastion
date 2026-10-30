// SPDX-License-Identifier: MIT OR Apache-2.0

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { defineConfig, type Plugin } from "vite";

const srcDir = new URL("./src/", import.meta.url);

/**
 * The files the browser reads as they are, relative to src/: the manifest and
 * the messages of every locale. They keep the same paths in dist/, because the
 * browser looks for `manifest.json` and `_locales/<locale>/messages.json` at
 * the root of the extension.
 */
function staticFiles(): string[] {
  const locales = readdirSync(new URL("_locales/", srcDir));
  return [
    "manifest.json",
    ...locales.map((locale) => `_locales/${locale}/messages.json`),
  ];
}

/** Copies {@link staticFiles} into the build output. */
function copyStaticFiles(): Plugin {
  return {
    name: "bastion:copy-static-files",
    buildStart() {
      for (const fileName of staticFiles()) {
        const path = new URL(fileName, srcDir);
        this.addWatchFile(fileURLToPath(path));
        this.emitFile({
          type: "asset",
          fileName,
          source: readFileSync(path, "utf-8"),
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [copyStaticFiles()],

  // Everything the extension ships is listed in this file: there is no
  // public/ directory copied in as well.
  publicDir: false,

  build: {
    rolldownOptions: {
      // An extension has no index.html: each entry point is a script that
      // the manifest names. Add new ones (such as the block page) here.
      input: {
        "service-worker": fileURLToPath(new URL("service-worker.ts", srcDir)),
      },
      output: {
        // The manifest needs a fixed file name, so no content hash.
        entryFileNames: "[name].js",
      },
    },
  },
});

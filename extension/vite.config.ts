// SPDX-License-Identifier: MIT OR Apache-2.0

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { defineConfig, type Plugin } from "vite";

import { manifestVersion } from "./src/manifest-version";

const srcDir = new URL("./src/", import.meta.url);
const packageJson = new URL("./package.json", import.meta.url);

/**
 * The messages of every locale, relative to src/. They keep the same paths in
 * dist/, because the browser looks for `_locales/<locale>/messages.json` at the
 * root of the extension.
 */
function localeFiles(): string[] {
  const locales = readdirSync(new URL("_locales/", srcDir));
  return locales.map((locale) => `_locales/${locale}/messages.json`);
}

/**
 * Writes the manifest into the build output, also at the root, with the version
 * from package.json, which release-please keeps up to date. The `version` in
 * src/manifest.json is only there for the unit tests and never ships.
 */
function manifestWithProjectVersion(): string {
  const { version } = JSON.parse(readFileSync(packageJson, "utf-8")) as {
    version: string;
  };
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", srcDir), "utf-8"),
  ) as Record<string, unknown>;

  return `${JSON.stringify({ ...manifest, version: manifestVersion(version) }, null, 2)}\n`;
}

/** Copies the files the browser reads directly into the build output. */
function copyStaticFiles(): Plugin {
  return {
    name: "bastion:copy-static-files",
    buildStart() {
      this.addWatchFile(fileURLToPath(packageJson));
      this.addWatchFile(fileURLToPath(new URL("manifest.json", srcDir)));
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: manifestWithProjectVersion(),
      });

      for (const fileName of localeFiles()) {
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

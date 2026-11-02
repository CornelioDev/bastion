// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Which licenses the npm dependencies of `apps/desktop` and `extension` may use, and
// how to judge them. It is deny.toml's policy for npm: permissive licenses only, and
// anything not listed here fails. check-npm-licenses.mjs applies it, development
// dependencies included. Loosening it needs a reason written next to the change.
//
// The result relies on the license each package declares in its package.json, which
// is what pnpm reports. Nothing reads the license texts, so a wrong declaration passes.
//
// Not a gate right now: this check is off during the MVP, by the maintainer's decision
// (2026-11-02), and must be analyzed before the first public release.
// CI doesn't run it, and it fails today on elkjs (EPL-2.0), which has no exception.

/**
 * Licenses any package may use: deny.toml's `allow` list, for the same reasons, plus
 * two that ask for even less than MIT (no notice at all). Copyleft licenses (GPL, LGPL,
 * AGPL, MPL, EPL and others) are not listed, and therefore rejected.
 */
export const ALLOWED_LICENSES = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "Apache-2.0 WITH LLVM-exception",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Zlib",
  "Unicode-3.0",
]);

/**
 * Packages allowed a license that is not in `ALLOWED_LICENSES`, each for a reason.
 *
 * As in deny.toml, each one is pinned to the version that was reviewed: `1` matches any
 * 1.x, and `0.37` any 0.37.x. A new major version must be reviewed again, and any other
 * package with this license still fails.
 */
export const PACKAGE_EXCEPTIONS = [
  // MPL-2.0: weak copyleft at the level of each file, with the same reasoning as the
  // MPL-2.0 crates in deny.toml. We use these files unmodified from the registry. The
  // CSS transformer behind Tailwind CSS and Vite, and its native binary for Windows.
  { package: "lightningcss", version: "1", license: "MPL-2.0" },
  { package: "lightningcss-win32-x64-msvc", version: "1", license: "MPL-2.0" },

  // BlueOak-1.0.0: permissive, like MIT with a patent grant. These only run during
  // development: `minimatch` under ESLint, the others under `glob` in @vue/test-utils.
  { package: "minimatch", version: "10", license: "BlueOak-1.0.0" },
  { package: "glob", version: "13", license: "BlueOak-1.0.0" },
  { package: "lru-cache", version: "11", license: "BlueOak-1.0.0" },
  { package: "minipass", version: "7", license: "BlueOak-1.0.0" },
  { package: "path-scurry", version: "2", license: "BlueOak-1.0.0" },

  // OFL-1.1: the Geist fonts the app bundles, a license made for fonts (T-0.9). It covers
  // the fonts and not the software shipped with them. Their license texts are bundled too.
  { package: "@fontsource-variable/geist", version: "5", license: "OFL-1.1" },
  { package: "@fontsource-variable/geist-mono", version: "5", license: "OFL-1.1" },

  // CC0-1.0: a public domain dedication. Data about CSS, read by a development tool.
  { package: "mdn-data", version: "2", license: "CC0-1.0" },

  // Unlicense: a public domain dedication. Geometry code under the chart library.
  { package: "robust-predicates", version: "3", license: "Unlicense" },
];

/**
 * Whether an SPDX expression holds when only `allowed` licenses are acceptable: an `OR`
 * needs one side, an `AND` both. Anything that isn't a well-formed expression, such as
 * `SEE LICENSE IN file` or `Unknown`, is false, so that it fails the check.
 */
export function licenseSatisfied(expression, allowed) {
  const tokens = expression.match(/[()]|[^\s()]+/g) ?? [];
  let position = 0;

  /** A license, `<license> WITH <exception>`, or an expression in parentheses. */
  function parseTerm() {
    const token = tokens[position];
    position += 1;
    if (token === "(") {
      const value = parseOr();
      if (tokens[position] !== ")") {
        throw new Error("no closing parenthesis");
      }
      position += 1;
      return value;
    }
    if (token === undefined || token === ")" || token === "AND" || token === "OR") {
      throw new Error("no license where one should be");
    }
    if (tokens[position] === "WITH") {
      const exception = tokens[position + 1];
      position += 2;
      return allowed.has(`${token} WITH ${exception}`);
    }
    return allowed.has(token);
  }

  function parseAnd() {
    let value = parseTerm();
    while (tokens[position] === "AND") {
      position += 1;
      // Parses first, so that the rest of a false expression is still checked.
      value = parseTerm() && value;
    }
    return value;
  }

  function parseOr() {
    let value = parseAnd();
    while (tokens[position] === "OR") {
      position += 1;
      value = parseAnd() || value;
    }
    return value;
  }

  try {
    const value = parseOr();
    return position === tokens.length && value;
  } catch {
    return false;
  }
}

/** Whether `version` is the one an exception was reviewed for: `1` matches `1.2.3`. */
function versionMatches(version, pinned) {
  return version === pinned || version.startsWith(`${pinned}.`);
}

/**
 * Reads what `pnpm licenses list --json` printed, an object from each license to the
 * packages under it, into a flat list. Throws if it isn't that, or if it lists nothing:
 * a report with no packages means the check saw nothing, not that all is fine.
 */
export function parseLicenseReport(text) {
  const report = JSON.parse(text);
  const packages = Object.entries(report ?? {}).flatMap(([license, entries]) => {
    if (!Array.isArray(entries)) {
      throw new Error(`the entry for ${JSON.stringify(license)} is not a list`);
    }
    return entries.flatMap(({ name, versions }) => {
      if (typeof name !== "string" || !Array.isArray(versions) || versions.length === 0) {
        throw new Error(`an entry under ${JSON.stringify(license)} has no name or version`);
      }
      return versions.map((version) => ({ name, version, license }));
    });
  });
  if (packages.length === 0) {
    throw new Error("it lists no packages");
  }
  return packages;
}

/** Returns the packages of a parsed report whose license the policy doesn't accept. */
export function findLicenseViolations(
  packages,
  allowed = ALLOWED_LICENSES,
  exceptions = PACKAGE_EXCEPTIONS,
) {
  return packages.filter(({ name, version, license }) => {
    const accepted = new Set(allowed);
    for (const exception of exceptions) {
      if (exception.package === name && versionMatches(version, exception.version)) {
        accepted.add(exception.license);
      }
    }
    return !licenseSatisfied(license, accepted);
  });
}

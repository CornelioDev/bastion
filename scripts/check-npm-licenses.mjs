// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Checks the license of every npm dependency of `apps/desktop` and `extension`, what
// deny.toml does for the Rust ones. Development dependencies count, as they do there.
// The policy is in npm-license-policy.mjs. Run it through its recipe, which installs
// the dependencies first, as `pnpm licenses` reads what is installed:
//
//     just npm-licenses
//
// Exit codes:
// - 0: both packages follow the policy.
// - 1: at least one dependency doesn't; each one is listed.
// - 2: the check could not run. This is never a pass: pnpm failing, or a report that
//   lists no packages or can't be read.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { findLicenseViolations, parseLicenseReport } from "./npm-license-policy.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = ["apps/desktop", "extension"];

/** Exit code for a dependency that breaks the policy. */
const EXIT_VIOLATION = 1;
/** Exit code for a check that could not run. */
const EXIT_CANNOT_CHECK = 2;

/** Formats untrusted text as one line, with nothing GitHub Actions would act on. */
function show(text) {
  return JSON.stringify(String(text)).replaceAll("##[", "#\\u0023[");
}

// cmd.exe looks for a command in the current directory before PATH, so a `pnpm.cmd` in
// the repository would run instead of pnpm. This variable makes it use PATH only, as in
// the justfile, and setting it here also covers running the script without `just`.
process.env.NoDefaultCurrentDirectoryInExePath = "1";

/** Returns the installed packages of a project, with their licenses. */
function licensesOf(directory) {
  // Through a shell because an install of pnpm can be a `pnpm.cmd`, which Windows only
  // starts through one. The command is a constant: nothing from outside is in it.
  const result = spawnSync(`pnpm --dir ${directory} licenses list --json`, {
    shell: true,
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    // Large enough for any real report; going over it is an error, not a truncated one.
    maxBuffer: 1024 ** 3,
  });
  if (result.error) {
    throw new Error(`could not run pnpm in ${directory}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`pnpm exited with ${result.status} in ${directory}: ${result.stderr.trim()}`);
  }
  try {
    return parseLicenseReport(result.stdout);
  } catch (error) {
    throw new Error(`cannot read the report of pnpm in ${directory}: ${error.message}`, {
      cause: error,
    });
  }
}

/** Runs the check and returns the exit code; throws if it cannot run. */
function check() {
  let exitCode = 0;
  for (const directory of PACKAGES) {
    const packages = licensesOf(directory);
    const violations = findLicenseViolations(packages);
    for (const { name, version, license } of violations) {
      exitCode = EXIT_VIOLATION;
      console.error(`${directory}: ${show(`${name}@${version}`)} has the license ${show(license)}`);
    }
    if (violations.length === 0) {
      console.log(`npm licenses: ${directory}, ${packages.length} package(s) checked, all fine.`);
    }
  }
  if (exitCode !== 0) {
    console.error(
      "These licenses are not accepted; see scripts/npm-license-policy.mjs. Replace the package, or get an exception with a reason.",
    );
  }
  return exitCode;
}

try {
  process.exitCode = check();
} catch (error) {
  // Sanitized here, so that it covers every error: they can quote pnpm's output.
  console.error(`Cannot check npm licenses: ${show(error.message)}`);
  process.exitCode = EXIT_CANNOT_CHECK;
}

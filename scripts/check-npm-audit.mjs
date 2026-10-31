// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Runs `pnpm audit` in `apps/desktop` and in `extension`, each one even if the other
// fails, so that a run shows every advisory. A justfile recipe stops at its first failing
// line, which would hide the second package. Run it through its recipe:
//
//     just npm-audit
//
// Exit codes:
// - 0: pnpm reported no advisories in either package.
// - 1: at least one advisory; each one is listed.
// - 2: the check could not tell for at least one package, whatever the other found, as in
//   check-npm-licenses.mjs. This is never a pass: pnpm missing, a registry that is down or
//   gives an error or an unreadable reply, or a report that isn't what this expects.
//
// Why it reads pnpm's report: pnpm 12 exits with 1 both for advisories and for not being
// able to ask the registry. With `--json` it prints a report only in the first case, and
// nothing to standard output in the second.
//
// `--audit-level low` is written here so that `auditLevel` in a pnpm-workspace.yaml can't
// raise it. On top of that the verdict comes from the report's counts, which pnpm doesn't
// filter. Advisories of severity `info` don't fail, as they are below `low`. There is no
// `--prod`: development dependencies count, as they do for cargo-deny.
//
// What this cannot see: a registry that wrongly replies `{}`. That is also the real reply
// when there are no advisories, and pnpm turns it into a normal report, so nothing tells
// the two apart. Packages go to the registry in a single request, and the audit trusts
// its answer.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = ["apps/desktop", "extension"];

/** Exit code for a package with advisories. */
const EXIT_ADVISORIES = 1;
/** Exit code for a check that could not tell. */
const EXIT_CANNOT_CHECK = 2;

/** The severities that fail the check, as `--audit-level low` selects them. */
const FAILING_SEVERITIES = ["low", "moderate", "high", "critical"];

// cmd.exe looks for a command in the current directory before PATH, so a `pnpm.cmd` in
// the repository would run instead of pnpm. This variable makes it use PATH only, as in
// the justfile, and setting it here also covers running the script without `just`.
process.env.NoDefaultCurrentDirectoryInExePath = "1";

/** Formats text from the registry as one line, with nothing GitHub Actions would act on. */
function show(text) {
  return JSON.stringify(text).replaceAll("##[", "#\\u0023[");
}

/**
 * Reads pnpm's report into the number of failing advisories and their list. Throws if it
 * isn't a report, or if it says no dependency was audited.
 */
function parseReport(stdout) {
  const report = JSON.parse(stdout);
  const counts = report?.metadata?.vulnerabilities;
  if (typeof report?.advisories !== "object" || report.advisories === null) {
    throw new Error("it has no list of advisories");
  }
  if (!FAILING_SEVERITIES.every((severity) => Number.isInteger(counts?.[severity]))) {
    throw new Error("it has no count per severity");
  }
  if (!(report.metadata.totalDependencies > 0)) {
    throw new Error("it says no dependency was audited");
  }
  let count = 0;
  for (const severity of FAILING_SEVERITIES) {
    count += counts[severity];
  }
  return { count, advisories: Object.values(report.advisories) };
}

/** Audits a project and returns the exit code for it; throws if it cannot tell. */
function audit(directory) {
  // Through a shell because an install of pnpm can be a `pnpm.cmd`, which Windows only
  // starts through one. The command is a constant: nothing from outside is in it.
  const result = spawnSync(`pnpm --dir ${directory} audit --json --audit-level low`, {
    shell: true,
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    // Large enough for any real report; going over it is an error, not a truncated one.
    maxBuffer: 1024 ** 3,
  });
  if (result.error) {
    throw new Error(`could not run pnpm: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`pnpm exited with ${result.status}: ${show(result.stderr.trim())}`);
  }
  let report;
  try {
    report = parseReport(result.stdout);
  } catch (error) {
    const details = result.stderr.trim();
    throw new Error(`no usable report (${error.message})${details ? `: ${show(details)}` : ""}`, {
      cause: error,
    });
  }
  const { count, advisories } = report;
  if (result.status === 1 && count === 0) {
    throw new Error("pnpm exited with 1, but its report counts no advisories");
  }
  if (count === 0) {
    console.log(`npm audit: ${directory}, no advisories.`);
    return 0;
  }
  console.error(`${directory}: ${count} advisory(ies)`);
  for (const advisory of advisories) {
    console.error(
      `  ${show(advisory.severity)} ${show(advisory.module_name)} ${show(advisory.github_advisory_id ?? advisory.url)}: ${show(advisory.title)}`,
    );
  }
  return EXIT_ADVISORIES;
}

let exitCode = 0;
for (const directory of PACKAGES) {
  try {
    exitCode = Math.max(exitCode, audit(directory));
  } catch (error) {
    console.error(`Cannot audit ${directory}: ${error.message}`);
    exitCode = EXIT_CANNOT_CHECK;
  }
}
process.exitCode = exitCode;

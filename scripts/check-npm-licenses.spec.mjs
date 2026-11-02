// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Tests for check-npm-licenses.mjs and npm-license-policy.mjs, with Node's own test
// runner. The end-to-end tests run the script with a stand-in for pnpm first on PATH,
// which prints a report from an environment variable. `just check` runs them
// (`just test-scripts`).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_LICENSES,
  findLicenseViolations,
  licenseSatisfied,
  parseLicenseReport,
  PACKAGE_EXCEPTIONS,
} from "./npm-license-policy.mjs";

const SCRIPT = fileURLToPath(new URL("check-npm-licenses.mjs", import.meta.url));
const PASS = 0;
const VIOLATION = 1;
const CANNOT_CHECK = 2;

const scratch = mkdtempSync(join(tmpdir(), "keitora-licenses-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

writeFileSync(
  join(scratch, "pnpm.cmd"),
  '@echo off\r\nnode "%~dp0fake-pnpm.mjs"\r\nexit /b %errorlevel%\r\n',
);
writeFileSync(
  join(scratch, "fake-pnpm.mjs"),
  "process.stdout.write(process.env.FAKE_PNPM_OUTPUT);\n" +
    "process.stderr.write(process.env.FAKE_PNPM_STDERR);\n" +
    "process.exitCode = Number(process.env.FAKE_PNPM_STATUS);\n",
);

/** Runs the script with pnpm printing `output` and exiting with `status`. */
function runScript(output, status = 0, stderr = "") {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${scratch}${delimiter}${process.env.PATH}`,
      FAKE_PNPM_OUTPUT: output,
      FAKE_PNPM_STATUS: String(status),
      FAKE_PNPM_STDERR: stderr,
    },
  });
}

/** One package under one license, as pnpm reports it. */
function reportOf(license, name, version = "1.0.0") {
  return JSON.stringify({ [license]: [{ name, versions: [version], paths: [] }] });
}

test("a simple allowed license is accepted", () => {
  assert.equal(licenseSatisfied("MIT", new Set(["MIT"])), true);
});

test("a license that isn't listed is rejected", () => {
  assert.equal(licenseSatisfied("GPL-3.0-only", new Set(["MIT"])), false);
});

test("OR needs one side, on either side", () => {
  const allowed = new Set(["MIT"]);
  assert.equal(licenseSatisfied("MIT OR GPL-3.0-only", allowed), true);
  assert.equal(licenseSatisfied("GPL-3.0-only OR MIT", allowed), true);
  assert.equal(licenseSatisfied("(MIT OR CC0-1.0)", allowed), true);
  assert.equal(licenseSatisfied("GPL-2.0-only OR GPL-3.0-only", allowed), false);
});

test("AND needs both sides", () => {
  const allowed = new Set(["MIT", "ISC"]);
  assert.equal(licenseSatisfied("MIT AND ISC", allowed), true);
  assert.equal(licenseSatisfied("MIT AND GPL-3.0-only", allowed), false);
  assert.equal(licenseSatisfied("GPL-3.0-only AND MIT", allowed), false);
});

test("AND binds tighter than OR, and parentheses change that", () => {
  const allowed = new Set(["MIT"]);
  assert.equal(licenseSatisfied("MIT OR GPL-3.0-only AND ISC", allowed), true);
  assert.equal(licenseSatisfied("(MIT OR GPL-3.0-only) AND ISC", allowed), false);
});

test("WITH counts as one license, and the base license doesn't cover it", () => {
  assert.equal(
    licenseSatisfied("Apache-2.0 WITH LLVM-exception", new Set(["Apache-2.0 WITH LLVM-exception"])),
    true,
  );
  assert.equal(licenseSatisfied("Apache-2.0 WITH Other", new Set(["Apache-2.0"])), false);
});

test("what isn't a well-formed expression is rejected", () => {
  const allowed = new Set(["MIT", "SEE", "Unknown"]);
  for (const text of [
    "",
    "SEE LICENSE IN LICENSE.md",
    "MIT OR",
    "OR MIT",
    "(MIT",
    "MIT)",
    "MIT MIT",
    "MIT WITH",
    "mit or MIT",
  ]) {
    assert.equal(licenseSatisfied(text, allowed), false, text);
  }
});

test("the policy accepts what the roadmap asks, and only per package", () => {
  assert.equal(ALLOWED_LICENSES.has("MPL-2.0"), false);
  assert.equal(ALLOWED_LICENSES.has("BlueOak-1.0.0"), false);
  const packages = [
    { name: "lightningcss", version: "1.32.0", license: "MPL-2.0" },
    { name: "minimatch", version: "10.2.6", license: "BlueOak-1.0.0" },
  ];
  assert.deepEqual(findLicenseViolations(packages), []);
});

test("an exception covers neither another package nor another license", () => {
  const otherPackage = { name: "other", version: "1.0.0", license: "MPL-2.0" };
  const otherLicense = { name: "lightningcss", version: "1.0.0", license: "GPL-3.0-only" };
  assert.deepEqual(findLicenseViolations([otherPackage, otherLicense]), [
    otherPackage,
    otherLicense,
  ]);
});

test("an exception is pinned to the version that was reviewed", () => {
  const exceptions = [{ package: "a", version: "1", license: "MPL-2.0" }];
  const minor = [{ package: "b", version: "0.37", license: "MPL-2.0" }];
  const allowed = new Set();
  const judged = (list, name, version) =>
    findLicenseViolations([{ name, version, license: "MPL-2.0" }], allowed, list).length === 0;
  assert.equal(judged(exceptions, "a", "1.9.0"), true);
  assert.equal(judged(exceptions, "a", "2.0.0"), false);
  assert.equal(judged(exceptions, "a", "10.0.0"), false);
  assert.equal(judged(minor, "b", "0.37.4"), true);
  assert.equal(judged(minor, "b", "0.38.0"), false);
});

test("every exception names a license the allow list doesn't already cover", () => {
  for (const exception of PACKAGE_EXCEPTIONS) {
    assert.equal(ALLOWED_LICENSES.has(exception.license), false, exception.package);
  }
});

test("a report becomes one entry per package and version", () => {
  const text = JSON.stringify({
    MIT: [{ name: "a", versions: ["1.0.0", "2.0.0"] }],
    ISC: [{ name: "b", versions: ["3.0.0"] }],
  });
  assert.deepEqual(parseLicenseReport(text), [
    { name: "a", version: "1.0.0", license: "MIT" },
    { name: "a", version: "2.0.0", license: "MIT" },
    { name: "b", version: "3.0.0", license: "ISC" },
  ]);
});

test("a report that says nothing or can't be read is an error, not a pass", () => {
  for (const text of [
    "",
    "not json",
    "null",
    "{}",
    '{"MIT":[]}',
    '{"MIT":"a"}',
    '{"MIT":[{"name":"a"}]}',
    '{"MIT":[{"name":"a","versions":[]}]}',
  ]) {
    assert.throws(() => parseLicenseReport(text), undefined, text);
  }
});

test("the script passes when every license is accepted", () => {
  const result = runScript(reportOf("MIT", "a"));
  assert.equal(result.status, PASS, result.stderr);
  assert.match(result.stdout, /apps\/desktop, 1 package\(s\) checked/);
  assert.match(result.stdout, /extension, 1 package\(s\) checked/);
});

test("the script lists a license that isn't accepted", () => {
  const result = runScript(reportOf("EPL-2.0", "elkjs", "0.10.2"));
  assert.equal(result.status, VIOLATION);
  assert.match(result.stderr, /apps\/desktop: "elkjs@0\.10\.2" has the license "EPL-2\.0"/);
  assert.match(result.stderr, /extension: "elkjs@0\.10\.2"/);
});

test("the script can't pass if pnpm fails or its report is empty", () => {
  assert.equal(runScript(reportOf("MIT", "a"), 1).status, CANNOT_CHECK);
  assert.equal(runScript("{}").status, CANNOT_CHECK);
  assert.equal(runScript("not json").status, CANNOT_CHECK);
});

const HOSTILE = "x\n::error::pwned\n##[error]pwned";

/** Fails if GitHub Actions would read any line of this output as a workflow command. */
function assertNoWorkflowCommand(output) {
  assert.doesNotMatch(output, /##\[/);
  for (const line of output.split(/\r?\n/)) {
    assert.doesNotMatch(line, /^\s*::/, line);
  }
}

test("hostile text from a report can't print a workflow command", () => {
  const report = JSON.stringify({ [HOSTILE]: [{ name: HOSTILE, versions: [HOSTILE] }] });
  const result = runScript(report);
  assert.equal(result.status, VIOLATION);
  assert.match(result.stderr, /pwned/);
  assertNoWorkflowCommand(result.stderr);
});

test("hostile output from pnpm can't print a workflow command", () => {
  for (const failing of [runScript(HOSTILE), runScript("{}", 1, HOSTILE)]) {
    assert.equal(failing.status, CANNOT_CHECK);
    assertNoWorkflowCommand(failing.stderr);
  }
});

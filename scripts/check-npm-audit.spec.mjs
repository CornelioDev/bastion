// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Tests for check-npm-audit.mjs, with Node's own test runner. They run the script with a
// stand-in for pnpm first on PATH, which fails in the package an environment variable
// names. `just check` runs them (`just test-scripts`).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("check-npm-audit.mjs", import.meta.url));

const scratch = mkdtempSync(join(tmpdir(), "bastion-audit-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

writeFileSync(
  join(scratch, "pnpm.cmd"),
  '@echo off\r\nnode "%~dp0fake-pnpm.mjs" %*\r\nexit /b %errorlevel%\r\n',
);
writeFileSync(
  join(scratch, "fake-pnpm.mjs"),
  'const args = process.argv.slice(2).join(" ");\n' +
    "console.log(`ran: ${args}`);\n" +
    "process.exitCode = process.env.FAKE_PNPM_FAILS && args.includes(process.env.FAKE_PNPM_FAILS) ? 1 : 0;\n",
);

/** Runs the script with pnpm failing in the package `fails`, if any. */
function runScript(fails = "") {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${scratch}${delimiter}${process.env.PATH}`,
      FAKE_PNPM_FAILS: fails,
    },
  });
}

test("passes when both packages pass, and audits both", () => {
  const result = runScript();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ran: --dir apps\/desktop audit/);
  assert.match(result.stdout, /ran: --dir extension audit/);
});

test("the audit keeps every dependency: no --prod, no --audit-level", () => {
  const { stdout } = runScript();
  assert.doesNotMatch(stdout, /--prod|--audit-level|--ignore/);
});

test("a failure in the first package fails, and the second is still audited", () => {
  const result = runScript("apps/desktop");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ran: --dir extension audit/);
  assert.match(result.stderr, /failed in apps\/desktop/);
});

test("a failure in the second package fails", () => {
  const result = runScript("extension");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed in extension/);
});

test("pnpm not being there fails", () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, PATH: "no-such-directory", Path: undefined },
  });
  assert.notEqual(result.status, 0);
});

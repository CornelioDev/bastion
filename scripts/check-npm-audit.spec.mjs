// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Tests for check-npm-audit.mjs, with Node's own test runner. Two kinds, as what the script
// reads is what pnpm does, which a stand-in can only assume:
// - With a stand-in for pnpm first on PATH, which gives each package the reply an
//   environment variable says.
// - With the real pnpm and a local fake registry (`pnpm_config_registry`; pnpm 12 ignores
//   `npm_config_registry`). pnpm only reads the lockfiles and asks that registry; nothing
//   else goes over the network. Its retries are off, as they take over a minute.
//
// `just check` runs them (`just test-scripts`).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("check-npm-audit.mjs", import.meta.url));
const PASS = 0;
const ADVISORIES = 1;
const CANNOT_CHECK = 2;

const scratch = mkdtempSync(join(tmpdir(), "bastion-audit-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

writeFileSync(
  join(scratch, "pnpm.cmd"),
  '@echo off\r\nnode "%~dp0fake-pnpm.mjs" %*\r\nexit /b %errorlevel%\r\n',
);
writeFileSync(
  join(scratch, "fake-pnpm.mjs"),
  `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_PNPM_LOG, args.join(" ") + "\\n");
const reply = JSON.parse(process.env.FAKE_PNPM_REPLIES)[args[1]];
process.stdout.write(reply.stdout);
process.stderr.write(reply.stderr ?? "");
process.exitCode = reply.status;
`,
);

/** A report as pnpm prints it, with `moderate` advisories of a package. */
function report(moderate = 0) {
  const advisories = {};
  if (moderate > 0) {
    advisories[1] = {
      severity: "moderate",
      module_name: "minimatch",
      github_advisory_id: "GHSA-test",
      title: "A title",
    };
  }
  return JSON.stringify({
    advisories,
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
}

/** What the registry replies for advisories on minimatch, which both lockfiles have. */
function repliedAdvisories(...advisories) {
  return JSON.stringify({
    minimatch: advisories.map(([id, severity], index) => ({
      id: index + 1,
      url: `https://github.com/advisories/${id}`,
      title: "A title",
      severity,
      vulnerable_versions: ">=0.0.0",
      cwe: [],
      cvss: {},
    })),
  });
}

// The advisories accepted in the projects' pnpm-workspace.yaml. Tests send them from the
// fake registry, so they don't depend on what the real one says about the lockfiles.
const MINIMATCH_ADVISORY = "GHSA-g3hv-75wg-m249";
const GLOB_ADVISORY = "GHSA-3g3m-2fjr-6pw4";

const CLEAN = { status: 0, stdout: report() };
const FOUND = { status: 1, stdout: report(1) };
const FAILED = { status: 1, stdout: "" };

/** Runs the script, asynchronously so that a fake registry here can reply to it. */
function run(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

let runs = 0;
/** Runs the script with the stand-in for pnpm, and returns also what it was called with. */
async function runWithFake(desktop, extension) {
  runs += 1;
  const log = join(scratch, `calls-${runs}.log`);
  writeFileSync(log, "");
  const result = await run({
    PATH: `${scratch}${delimiter}${process.env.PATH}`,
    FAKE_PNPM_LOG: log,
    FAKE_PNPM_REPLIES: JSON.stringify({ "apps/desktop": desktop, extension }),
  });
  return { ...result, calls: readFileSync(log, "utf8").trim().split(/\r?\n/) };
}

/** Runs the script with the real pnpm and this registry, without retries. */
function runWithRealPnpm(registry) {
  return run({ pnpm_config_registry: registry, pnpm_config_fetch_retries: "0" });
}

/** Runs the script with the real pnpm and a registry giving this reply. */
async function runWithRegistry(status, body) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests += 1;
    request.resume();
    request.on("end", () => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await runWithRealPnpm(`http://127.0.0.1:${server.address().port}/`);
    return { ...result, requests };
  } finally {
    server.close();
  }
}

test("passes when both packages are clean, and audits both with the fixed options", async () => {
  const result = await runWithFake(CLEAN, CLEAN);
  assert.equal(result.status, PASS, result.stderr);
  assert.deepEqual(result.calls, [
    "--dir apps/desktop audit --json --audit-level low",
    "--dir extension audit --json --audit-level low",
  ]);
});

test("exit 1: advisories in the first package are listed, and the second is still audited", async () => {
  const result = await runWithFake(FOUND, CLEAN);
  assert.equal(result.status, ADVISORIES);
  assert.equal(result.calls.length, 2);
  assert.match(result.stderr, /apps\/desktop: 1 advisory/);
  assert.match(result.stderr, /"moderate" "minimatch" "GHSA-test": "A title"/);
  assert.match(result.stdout, /extension, no advisories/);
});

test("exit 1: advisories in the second package", async () => {
  const result = await runWithFake(CLEAN, FOUND);
  assert.equal(result.status, ADVISORIES);
  assert.match(result.stderr, /extension: 1 advisory/);
});

test("exit 0: an advisory that is counted but not listed was ignored by ID", async () => {
  const ignored = JSON.stringify({
    advisories: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
  const result = await runWithFake({ status: 0, stdout: ignored }, CLEAN);
  assert.equal(result.status, PASS, result.stderr);
  assert.match(result.stdout, /apps\/desktop, no advisories; it counts 1, ignored by ID/);
});

test("exit 1: an advisory in the list fails, whatever the exit status says", async () => {
  const result = await runWithFake({ status: 0, stdout: report(1) }, CLEAN);
  assert.equal(result.status, ADVISORIES);
});

test("exit 0: an `info` advisory is below the level", async () => {
  const stdout = JSON.stringify({
    advisories: {},
    metadata: {
      vulnerabilities: { info: 1, low: 0, moderate: 0, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
  const result = await runWithFake({ status: 0, stdout }, CLEAN);
  assert.equal(result.status, PASS, result.stderr);
});

test("exit 2: pnpm fails with no report, and the second package is still audited", async () => {
  const result = await runWithFake(FAILED, CLEAN);
  assert.equal(result.status, CANNOT_CHECK);
  assert.equal(result.calls.length, 2);
  assert.match(result.stderr, /Cannot audit apps\/desktop/);
  assert.match(result.stdout, /extension, no advisories/);
});

test("exit 2 wins over advisories, whichever package has which", async () => {
  assert.equal((await runWithFake(FOUND, FAILED)).status, CANNOT_CHECK);
  const reversed = await runWithFake(FAILED, FOUND);
  assert.equal(reversed.status, CANNOT_CHECK);
  assert.match(reversed.stderr, /extension: 1 advisory/);
});

test("exit 2: a report that isn't what's expected, with either exit status", async () => {
  const noCounts = JSON.stringify({ advisories: {}, metadata: { totalDependencies: 10 } });
  const noList = JSON.stringify({
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
  const nothingAudited = JSON.stringify({
    advisories: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      totalDependencies: 0,
    },
  });
  const negative = JSON.stringify({
    advisories: {},
    metadata: {
      vulnerabilities: { info: 0, low: -1, moderate: 0, high: 1, critical: 0 },
      totalDependencies: 10,
    },
  });
  const listedNotCounted = JSON.stringify({
    advisories: { 1: { severity: "high", module_name: "a", title: "b" } },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
  for (const stdout of [
    "",
    "not json",
    "null",
    "{}",
    "[]",
    noCounts,
    noList,
    nothingAudited,
    negative,
    listedNotCounted,
  ]) {
    for (const status of [0, 1]) {
      const result = await runWithFake({ status, stdout }, CLEAN);
      assert.equal(result.status, CANNOT_CHECK, `${status} ${stdout}`);
    }
  }
});

test("exit 2: pnpm says it failed, but its report lists nothing", async () => {
  const result = await runWithFake({ status: 1, stdout: report() }, CLEAN);
  assert.equal(result.status, CANNOT_CHECK);
});

test("exit 2: an exit status pnpm doesn't use for audits", async () => {
  const result = await runWithFake({ status: 3, stdout: report() }, CLEAN);
  assert.equal(result.status, CANNOT_CHECK);
});

test("exit 2: pnpm is not there", async () => {
  const result = await run({ PATH: "no-such-directory", Path: undefined });
  assert.equal(result.status, CANNOT_CHECK);
});

test("real pnpm, exit 2: the registry is down", async () => {
  // Port 9 is the discard service, which nothing listens on here.
  const result = await runWithRealPnpm("http://127.0.0.1:9/");
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
  assert.match(result.stderr, /Cannot audit apps\/desktop/);
  assert.match(result.stderr, /Cannot audit extension/);
});

for (const [name, status, body] of [
  ["an error status", 500, "boom"],
  ["a body that isn't JSON", 200, "<html>"],
  ["a body of another shape", 200, "[]"],
]) {
  test(`real pnpm, exit 2: the registry replies with ${name}`, async () => {
    const result = await runWithRegistry(status, body);
    assert.equal(result.status, CANNOT_CHECK, result.stderr);
    assert.ok(result.requests >= 2, `${result.requests} request(s)`);
  });
}

test("real pnpm, exit 1: the registry reports an advisory", async () => {
  const result = await runWithRegistry(200, repliedAdvisories(["GHSA-test", "low"]));
  assert.equal(result.status, ADVISORIES, result.stderr);
  assert.match(result.stderr, /"low" "minimatch"/);
});

test("real pnpm, exit 0: `{}` is the registry's reply for no advisories", async () => {
  const result = await runWithRegistry(200, "{}");
  assert.equal(result.status, PASS, result.stderr);
});

test("real pnpm, exit 0: a known limit, an advisory of unknown severity is dropped", async () => {
  const result = await runWithRegistry(200, repliedAdvisories(["GHSA-test", "banana"]));
  assert.equal(result.status, PASS, result.stderr);
});

test("the ignored advisories are exactly the ones the maintainer accepted", () => {
  const ignoredIn = (directory) => {
    const file = new URL(`../${directory}/pnpm-workspace.yaml`, import.meta.url);
    return [...readFileSync(file, "utf8").matchAll(/^\s*- (GHSA-\S+)/gm)].map((match) => match[1]);
  };
  assert.deepEqual(ignoredIn("apps/desktop"), [MINIMATCH_ADVISORY, GLOB_ADVISORY]);
  assert.deepEqual(ignoredIn("extension"), [MINIMATCH_ADVISORY]);
});

test("real pnpm, exit 0: the advisory both projects ignore", async () => {
  const result = await runWithRegistry(200, repliedAdvisories([MINIMATCH_ADVISORY, "high"]));
  assert.equal(result.status, PASS, result.stderr);
  assert.match(result.stdout, /apps\/desktop, no advisories; it counts 1, ignored by ID/);
  assert.match(result.stdout, /extension, no advisories; it counts 1, ignored by ID/);
});

test("real pnpm, exit 1: any other advisory still fails next to an ignored one", async () => {
  const result = await runWithRegistry(
    200,
    repliedAdvisories([MINIMATCH_ADVISORY, "high"], ["GHSA-other", "low"]),
  );
  assert.equal(result.status, ADVISORIES, result.stderr);
  assert.match(result.stderr, /GHSA-other/);
  assert.doesNotMatch(result.stderr, new RegExp(MINIMATCH_ADVISORY));
});

test("real pnpm, exit 1: an ID is only ignored in the project that lists it", async () => {
  const result = await runWithRegistry(200, repliedAdvisories([GLOB_ADVISORY, "high"]));
  assert.equal(result.status, ADVISORIES, result.stderr);
  assert.match(result.stdout, /apps\/desktop, no advisories/);
  assert.match(result.stderr, /extension: 1 advisory/);
});

const HOSTILE = "x\n::error::pwned\n##[error]pwned";

/** Fails if GitHub Actions would read any line of this output as a workflow command. */
function assertNoWorkflowCommand(output) {
  assert.doesNotMatch(output, /##\[/);
  for (const line of output.split(/\r?\n/)) {
    assert.doesNotMatch(line, /^\s*::/, line);
  }
}

test("a hostile advisory can't print a workflow command", async () => {
  const stdout = JSON.stringify({
    advisories: {
      1: {
        severity: HOSTILE,
        module_name: HOSTILE,
        github_advisory_id: HOSTILE,
        title: HOSTILE,
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 },
      totalDependencies: 10,
    },
  });
  const result = await runWithFake({ status: 1, stdout }, CLEAN);
  assert.equal(result.status, ADVISORIES);
  assert.match(result.stderr, /pwned/);
  assertNoWorkflowCommand(result.stderr);
});

test("hostile output from pnpm can't print a workflow command", async () => {
  for (const reply of [
    { status: 1, stdout: HOSTILE },
    { status: 1, stdout: "", stderr: HOSTILE },
    { status: 3, stdout: "", stderr: HOSTILE },
  ]) {
    const result = await runWithFake(reply, CLEAN);
    assert.equal(result.status, CANNOT_CHECK);
    assert.match(result.stderr, /Cannot audit apps\/desktop/);
    assertNoWorkflowCommand(result.stderr);
  }
});

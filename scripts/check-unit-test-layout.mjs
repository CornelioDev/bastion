// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Checks that the 90 % of `just coverage` keeps measuring production code in
// `bastion-core` and `bastion-ipc`. `just check` runs it (`just unit-test-layout`),
// from the root of the workspace:
//
//     node scripts/check-unit-test-layout.mjs
//
// Why: cargo-llvm-cov leaves out files named `tests.rs` or `*_tests.rs` and directories
// named `tests`, `examples` or `benches`, and that's where the unit tests of these
// crates live (AGENTS.md, "Writing Rust tests"). Product code under such a name goes
// unmeasured, test-only code under another name counts as covered code, and code under
// `#[cfg(not(test))]` isn't in the measured build at all. All of that passes clippy and
// the gate. This is a guard against accidents and ordinary code, not a sandbox. It
// checks three things for each crate:
//
// 1. The manifest, from `cargo metadata`: only a library and integration tests as targets
//    (so no build script), no direct proc-macro dependency, no local dependency but those
//    listed in the rules, and no other workspace member inside the crate's directory. If
//    either crate has a problem here, neither is built, as the build would run that code.
// 2. What the compiler read, in the dev profile with all features, for the library and
//    for its tests, from rustc's dep-info files. This sees `#[path]`, `include!` and
//    macro expansions, in the builds it runs:
//    - The library can't read a file with a name coverage leaves out, or a file outside
//      the crate's directory (cargo-llvm-cov also leaves out other workspace members, the
//      target directory, the registry and a path such as `../../other/tests/x.rs`). Names
//      only count below the workspace root, as for cargo-llvm-cov, so a parent directory
//      of the clone named `tests` changes nothing.
//    - Only tests can read a file coverage measures if the library reads it too: otherwise
//      test-only lines would add to the score. `tests/` and `*_tests.rs` hold test code.
//    - Neither can read anything but Rust and data (`.json`, `.md`, `.toml`) under a name
//      coverage measures.
//    - The test build's profile can't differ from dev (`[profile.test]`), going by the
//      settings cargo reports: optimization, debug info, debug assertions, overflow checks.
// 3. What the source says, as tokens (see unit-test-layout-rules.mjs), in every `.rs` file
//    in the crate's directory, leaving out only the `target` directory directly in it:
//    - A test attribute (`#[test]`, a path ending in it, `#[bench]`, `#[test_case]`, or
//      any other with `test` in its name, as dependencies name theirs) fails outside a test
//      file, and so does a `use` of one, which could rename it. The placeholder test is the
//      exception, exactly as it is, in each crate's `src/lib.rs`, until it is deleted.
//    - In any file: a `use` of `include`, because data files that only tests read are
//      allowed, and a renamed `include!` would compile one as measured code.
//    - In any file: `cfg` or `cfg!` with `not` and `test`, any `cfg_attr` mentioning `test`,
//      anything on `coverage` or `debug_assertions`, a `$` in a predicate, `cfg_select!`,
//      `cfg_match!` and `cfg_if!`, and `#[path]` or `include!` naming a file that isn't `.rs`.
//    - `#[cfg(test)]` is allowed in a measured file only directly before `mod tests;`, with
//      no other attribute next to it.
//
// What this cannot see, so review still has to:
// - What a macro assembles: `#[$name]` called with `test`, `use core::prelude::v1::$n as t;`
//   followed by `#[t]`, `mk!(include)` expanding to `$n!("a.json")`, `#[path = $p]` naming a
//   data file, and a `cfg` whose own name is an argument, as in `#[$c(not($t))]` or
//   `when!(cfg, not(test), ...)`: a `$` is only rejected inside the brackets of a written `cfg`.
// - Logic in a `#[macro_export]` macro that only other crates expand, which is unmeasured.
// - Padding: trivially covered lines in an unconditional `pub` module still add to the score.
// - Test macros from a dependency, or what a dependency's macros expand to. Dependencies are
//   reviewed. Proc macros reached through a dependency are allowed, as `serde` needs them.
// - Code its builds don't compile: with `--all-features` on Windows, a module or function
//   under `#[cfg(not(feature = "..."))]`, `#[cfg(unix)]`, `target_feature` or `panic` is not
//   read, whatever its name (CONTRIBUTING.md lists what the gate doesn't measure).
// - A `cfg` set from outside the crate, through the environment or `.cargo/config.toml`
//   (`RUSTFLAGS`, `rustc-wrapper`); a build script of the crate itself is rejected.
// - Product code moved to another crate, which `-p` doesn't measure.
// - A pull request can also change this script or the justfile; as with the acceptance test
//   check, this catches accidents and shortcuts, and human review remains the control.
//
// Exit codes:
// - 0: both crates follow the rule.
// - 1: at least one violation; each one is listed.
// - 2: the check could not run, and found no violation. This is never a pass: a missing
//   crate directory, no source files, a crate that doesn't build (or isn't where it should
//   be), cargo's report or a dep-info file being missing, unexpected or empty, a symbolic
//   link in the crate, or a source file that can't be read for sure.
//
// Stale and forged results: cargo decides what to rebuild from file times, which a checkout
// can make misleading, so this never trusts an earlier build. It removes the crate's
// artifacts, and accepts a build only if cargo reports it as not fresh. It finds the dep-info
// files from cargo's report of what it built, which has to list exactly the expected targets,
// each once, with the files inside this check's target directory: compiler plugins can print
// to the same stream. That directory is its own, `target/unit-test-layout`, so that this
// doesn't rebuild what other recipes built, and `cargo check` is enough, as compiling further
// reads no more source.
//
// This runs on Node.js for the same reasons as check-acceptance-tests.mjs. Paths are
// untrusted, so they are printed through show(), and cargo runs without a shell.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import {
  findManifestProblems,
  isDataFile,
  isInside,
  isLeftOutOfCoverage,
  isTestFilePath,
  parseDepInfo,
  pathSegments,
  scanSource,
  selectBuilds,
  show,
} from "./unit-test-layout-rules.mjs";

// On Windows, Node.js looks for a program in the current directory before PATH, so a
// `cargo.exe` in the pull request would run instead of cargo and could make the check
// pass. This variable makes it use PATH only, as in the justfile.
process.env.NoDefaultCurrentDirectoryInExePath = "1";

/** Exit code for a file that breaks the rule. */
const EXIT_VIOLATION = 1;
/** Exit code for a check that could not run. */
const EXIT_CANNOT_CHECK = 2;

/** The crates this applies to: the ones `just coverage` holds to 90 %. */
const CRATES = ["bastion-core", "bastion-ipc"];

/** Where this builds, below the workspace root; `/target/` is ignored by Git. */
const TARGET_DIR = join("target", "unit-test-layout");

/** The profile settings cargo reports, which have to match between dev and test. */
const PROFILE_SETTINGS = ["opt_level", "debuginfo", "debug_assertions", "overflow_checks"];

/** Reads a file as rustc does: UTF-8 or nothing. */
function readUtf8(path) {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
}

/** Runs cargo without a shell; throws if it cannot start or exits with an error. */
function runCargo(args) {
  const result = spawnSync("cargo", [...args, "--color", "never"], {
    encoding: "utf8",
    maxBuffer: 1024 ** 3,
  });
  if (result.error) {
    throw new Error(`could not run cargo: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const errors = jsonLines(result.stdout)
      .filter((message) => message.message?.level === "error")
      .map((message) => message.message.rendered);
    const details = show([...errors, result.stderr.trim()].join("\n"));
    throw new Error(`\`cargo ${args[0]}\` exited with ${result.status}: ${details}`);
  }
  return result.stdout;
}

/** Parses cargo's `--message-format=json` output, leaving out lines of anything else. */
function jsonLines(stdout) {
  return stdout.split("\n").flatMap((line) => {
    try {
      return line.startsWith("{") ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
}

/** Returns the path of the dep-info file of a build, which has to be new and this check's. */
function depInfoOf(artifact, root) {
  if (artifact.fresh !== false) {
    throw new Error(`cargo reused an earlier build of ${show(artifact.target.name)}`);
  }
  const metadata = artifact.filenames?.filter((file) => extname(file) === ".rmeta") ?? [];
  if (metadata.length !== 1) {
    throw new Error(`cargo did not report the metadata of ${show(artifact.target.name)}`);
  }
  const stem = basename(metadata[0], ".rmeta").replace(/^lib/, "");
  const depInfo = join(dirname(metadata[0]), `${stem}.d`);
  if (!existsSync(depInfo)) {
    throw new Error(`the dep-info file ${show(depInfo)} does not exist`);
  }
  if (!isInside(realpathSync.native(join(root, TARGET_DIR)), realpathSync.native(depInfo))) {
    throw new Error(`the dep-info file ${show(depInfo)} is not in ${show(TARGET_DIR)}`);
  }
  return depInfo;
}

/** Runs `cargo check` and returns its report of each build of the crate. */
function checkArtifacts(crate, selection, targets) {
  const stdout = runCargo(["check", ...selection, ...targets, "--all-features", "--message-format=json"]);
  const manifest = realpathSync.native(join(crate.dir, "Cargo.toml"));
  return jsonLines(stdout).filter(
    (message) =>
      message.reason === "compiler-artifact" &&
      Array.isArray(message.target?.kind) &&
      typeof message.manifest_path === "string" &&
      existsSync(message.manifest_path) &&
      realpathSync.native(message.manifest_path) === manifest,
  );
}

/**
 * Builds the crate's library and tests from scratch, and returns the dep-info files of the
 * library and of the tests, and cargo's report of the library's two builds. Throws unless
 * cargo reports exactly the targets of `found`, the crate's package.
 */
function buildCrate(crate, found, root) {
  // Set here, as this wins over any configuration: the dep-info files are in the build
  // directory, which `build.build-dir` could move out of the target directory.
  const buildDir = `build.build-dir=${JSON.stringify(TARGET_DIR.replaceAll("\\", "/"))}`;
  const selection = ["--locked", "--config", buildDir, "--target-dir", TARGET_DIR, "-p", crate.name];
  runCargo(["clean", ...selection]);
  // Two runs, as `cargo check` only uses the profile `cargo test` does when told to, and
  // then for all it builds. The library's run is the dev profile `just coverage` measures.
  const libraryRun = checkArtifacts(crate, selection, ["--lib"]);
  const testRun = checkArtifacts(crate, selection, ["--tests", "--profile", "test"]);
  const testNames = found.targets
    .filter((target) => target.kind.includes("test") && target.test !== false)
    .map((target) => target.name);
  const libraryName = crate.name.replaceAll("-", "_");
  const { library, libraryForTests, tests } = selectBuilds(libraryRun, testRun, libraryName, testNames);
  return {
    library,
    libraryForTests,
    libraryDepInfo: depInfoOf(library, root),
    testDepInfos: [libraryForTests, ...tests].map((artifact) => depInfoOf(artifact, root)),
  };
}

/** Returns the path of a compiled file as cargo-llvm-cov compares it, below the workspace. */
function segmentsBelowWorkspace(file, root) {
  if (!isAbsolute(file)) {
    return pathSegments(file);
  }
  const unified = file.replaceAll("/", "\\").toLowerCase();
  for (const workspace of [root, process.cwd()]) {
    const prefix = `${workspace.replaceAll("/", "\\").toLowerCase()}\\`;
    if (unified.startsWith(prefix)) {
      return pathSegments(file.slice(prefix.length));
    }
  }
  return [];
}

/** Lists what a dep-info file says the compiler read: as written, and as a real path. */
function readDepInfo(depInfo, root) {
  return parseDepInfo(readUtf8(depInfo)).map((file) => {
    const absolute = resolve(root, file);
    if (!existsSync(absolute)) {
      throw new Error(`the dep-info file lists ${show(file)}, which does not exist`);
    }
    return { file, real: realpathSync.native(absolute) };
  });
}

/**
 * Checks what the compiler read for a crate. Adds to `violations`, and returns the Rust
 * files it read inside the crate, so that the text rules can cover them as well, wherever
 * they are.
 */
function checkCompiledFiles(crate, found, root, violations) {
  const build = buildCrate(crate, found, root);
  const libraryFiles = readDepInfo(build.libraryDepInfo, root);
  const crateRoot = realpathSync.native(join(crate.dir, "src", "lib.rs"));
  if (!libraryFiles.some(({ real }) => real === crateRoot)) {
    throw new Error(`the dep-info file does not list ${show(crateRoot)}, the crate's root`);
  }

  for (const setting of PROFILE_SETTINGS) {
    if (build.library.profile[setting] !== build.libraryForTests.profile[setting]) {
      violations.push(`${show(crate.name)}: \`[profile.test]\` changes ${setting} from dev`);
    }
  }

  const libraryReal = new Set();
  for (const { file, real } of libraryFiles) {
    libraryReal.add(real);
    const inCrate = isInside(crate.dir, real);
    if (!inCrate) {
      violations.push(`${show(file)}: compiled into the library, but outside ${show(crate.name)}`);
    } else if (
      isLeftOutOfCoverage(segmentsBelowWorkspace(file, root)) ||
      isLeftOutOfCoverage(pathSegments(relative(crate.dir, real)))
    ) {
      violations.push(
        `${show(file)}: compiled into the library, but \`just coverage\` doesn't measure this name`,
      );
    } else if (extname(real).toLowerCase() !== ".rs" && !isDataFile(real)) {
      violations.push(`${show(file)}: read by the library, and neither Rust nor \`.json\`, \`.md\`, \`.toml\``);
    }
  }

  const testFiles = build.testDepInfos.flatMap((depInfo) => readDepInfo(depInfo, root));
  const reported = new Set();
  for (const { file, real } of testFiles) {
    // Raw path only: that's what cargo-llvm-cov looks at, and what the file is called there.
    const leftOut = isTestFilePath(segmentsBelowWorkspace(file, root));
    if (!libraryReal.has(real) && !leftOut && !isDataFile(real) && !reported.has(real)) {
      reported.add(real);
      violations.push(
        extname(real).toLowerCase() === ".rs"
          ? `${show(file)}: read only by tests, but \`just coverage\` measures this name, so its lines would add to the score; test code goes in \`tests.rs\`, \`*_tests.rs\` or a \`tests\` directory`
          : `${show(file)}: read only by tests, and neither Rust nor data (\`.json\`, \`.md\`, \`.toml\`); such a file goes in a \`tests\` directory`,
      );
    }
  }
  return [...libraryFiles, ...testFiles]
    .map(({ real }) => real)
    .filter((real) => isInside(crate.dir, real) && extname(real).toLowerCase() === ".rs");
}

/**
 * Lists the `.rs` files under a directory, leaving out the entries in `skip`. Throws on
 * links, which it doesn't follow.
 */
function rustFilesUnder(directory, skip = new Set()) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`${show(path)} is a link, which this check doesn't follow`);
    } else if (entry.isDirectory()) {
      if (!skip.has(entry.name)) {
        files.push(...rustFilesUnder(path));
      }
    } else if (extname(entry.name).toLowerCase() === ".rs") {
      files.push(path);
    }
  }
  return files;
}

/** Applies the text rules to the files, adding to `violations`. */
function checkSources(crate, files, root, violations) {
  for (const file of files) {
    const segments = pathSegments(relative(crate.dir, file));
    const shown = show(relative(root, file));
    let source;
    let problems;
    try {
      source = readUtf8(file);
      problems = scanSource(source, {
        isTestFile: isTestFilePath(segments),
        isCrateRoot: segments.join("/") === "src/lib.rs",
      });
    } catch (error) {
      throw new Error(`could not read ${shown}: ${error.message}`);
    }
    // The problems come in the order of the source, so this counts each line once.
    let line = 1;
    let counted = 0;
    for (const { index, reason } of problems) {
      for (let next = source.indexOf("\n", counted); next !== -1 && next < index; ) {
        line += 1;
        counted = next + 1;
        next = source.indexOf("\n", counted);
      }
      violations.push(`${shown}:${line}: ${reason}`);
    }
  }
}

/** Returns a crate's name and real directory. Throws if it isn't where it should be. */
function crateAt(name, root) {
  const relativeDir = join("crates", name);
  if (!existsSync(join(root, relativeDir, "src"))) {
    throw new Error(`there is no ${show(join(relativeDir, "src"))} here; run this from the root`);
  }
  return { name, dir: realpathSync.native(join(root, relativeDir)) };
}

/**
 * Checks a crate's manifest, adding to `violations`. Returns the crate's package as
 * `found` and the number of `problems`, or the `error` that stopped it, for checkCrate().
 */
function inspectManifest(name, metadata, root, violations) {
  try {
    if (metadata === undefined) {
      throw new Error("`cargo metadata` did not run");
    }
    const { problems, found } = findManifestProblems(metadata, name, crateAt(name, root).dir, (path) =>
      existsSync(path) ? realpathSync.native(path) : path,
    );
    for (const problem of problems) {
      violations.push(`${show(name)} ${problem}`);
    }
    return { found, problems: problems.length };
  } catch (error) {
    return { error };
  }
}

/**
 * Checks one crate, adding to `violations`, given what inspectManifest() returned, and
 * builds it only if `canBuild`. Throws if it cannot finish.
 */
function checkCrate(name, inspection, canBuild, root, violations) {
  const relativeDir = join("crates", name);
  const crate = crateAt(name, root);
  const sourceFiles = rustFilesUnder(crate.dir, new Set(["target"]));
  if (!sourceFiles.some((file) => isInside(join(crate.dir, "src"), file))) {
    throw new Error(`${show(join(relativeDir, "src"))} has no Rust files`);
  }
  // The text rules run whatever the build says, so that both sets of findings show up.
  let compiled = [];
  let buildError;
  try {
    if (inspection.error) {
      throw inspection.error;
    }
    if (canBuild) {
      compiled = checkCompiledFiles(crate, inspection.found, root, violations);
    }
  } catch (error) {
    buildError = error;
  }
  checkSources(crate, [...new Set([...sourceFiles, ...compiled])], root, violations);
  if (buildError) {
    throw buildError;
  }
}

/** Runs the check on each crate and returns the exit code. */
function check() {
  if (process.argv.length > 2) {
    console.error("Cannot check the unit test layout: this script takes no arguments.");
    return EXIT_CANNOT_CHECK;
  }
  const root = realpathSync.native(process.cwd());
  const violations = [];
  const failures = [];
  let metadata;
  try {
    metadata = JSON.parse(
      runCargo(["metadata", "--locked", "--format-version", "1", "--all-features"]),
    );
  } catch (error) {
    failures.push(`the workspace: ${error.message}`);
  }
  // A build script or a proc macro would run in the build, also from one crate's build of
  // the other, so what is wrong with either manifest is fixed before anything is built.
  const inspections = CRATES.map((name) => inspectManifest(name, metadata, root, violations));
  const canBuild = inspections.every(({ error, problems }) => !error && problems === 0);
  for (const [index, name] of CRATES.entries()) {
    try {
      checkCrate(name, inspections[index], canBuild, root, violations);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  for (const violation of violations) {
    console.error(violation);
  }
  for (const failure of failures) {
    console.error(`Cannot check the unit test layout of ${failure}`);
  }
  if (violations.length > 0) {
    console.error(
      'Unit tests of these crates go in a sibling file, and that name holds nothing else; see AGENTS.md, "Writing Rust tests".',
    );
    return EXIT_VIOLATION;
  }
  if (failures.length > 0) {
    return EXIT_CANNOT_CHECK;
  }
  console.log(`Unit test layout: ${CRATES.join(" and ")} checked, all fine.`);
  return 0;
}

try {
  process.exitCode = check();
} catch (error) {
  console.error(`Cannot check the unit test layout: ${error.message}`);
  process.exitCode = EXIT_CANNOT_CHECK;
}

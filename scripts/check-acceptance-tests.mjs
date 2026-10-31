// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Checks that acceptance tests (`**/tests/acceptance*`) only change in commits
// whose subject starts with `test(`, and that those commits change nothing else
// (docs/workflow.md, "Acceptance tests are protected"). Run it on a pull-request
// branch through its recipe, with the base the branch is compared to:
//
//     just check-acceptance-tests <base>
//
// What this is for: a commit prefix is a signal, not a proof of who wrote the
// commit. Anyone can type `test(`, and a pull request can change this script.
// The check catches agents and people changing acceptance tests by accident;
// human review remains the control.
//
// Exit codes:
// - 0: every commit in `<base>..HEAD` follows the rule.
// - 1: at least one commit breaks it; each one is listed.
// - 2: the check could not run. This is never a pass: an unknown base, a shallow
//   clone (CI must check out with `fetch-depth: 0`), no commits to check, a base
//   with no history in common with HEAD, or any Git error.
//
// Which files count: a directory named `tests` directly above a file or
// directory whose name starts with `acceptance`, at any depth. A file counts if
// it was added, modified, deleted or changed mode. Renames are switched off, so
// a rename is a deletion plus an addition: a file moved into or out of an
// acceptance path counts either way.
//
// Merge commits: a merge is compared to the merge Git would make by itself from
// the same two parents (`git merge-tree`), not to the parents, so only what was
// done by hand counts. The commits being merged are checked on their own, or are
// already part of the base, so a merge from `main` passes even when it brings in
// changes to acceptance tests. `git diff-tree --cc` is not enough: it only lists
// files that differ from every parent, so it misses a merge that throws away one
// side's change to a test (`git merge -s ours`). A path Git reports as a conflict
// counts as changed, whichever side is kept, because Git's own tree can already
// hold one side of a conflict (modify/delete, binary files). A merge of more than
// two branches has no such comparison, so every difference from any parent counts.
// That comparison ignores the `.gitattributes` in the repository (GIT_ATTR_SOURCE),
// which a pull request could change to alter the merge it is compared to; a merge
// that really relied on such an attribute shows up as a change. It needs Git 2.43
// or newer: older versions ignore the setting or crash with it in `git merge-tree`.
//
// This script runs on Node.js, which every contributor and CI already have for
// the frontend packages, because the justfile runs recipes with cmd.exe, where
// `sh` is usually not on PATH. It also keeps untrusted values away from any
// shell. The base, and the file names and subjects in a pull request, are
// untrusted:
// - The justfile passes the base in the ACCEPTANCE_BASE environment variable, and
//   no command line ever contains it: a `{{base}}` in a cmd.exe line could run
//   commands.
// - Git runs without a shell, each value being one argument, and it lists file
//   names separated by NUL bytes.
// - Untrusted text is printed through show(), so that a file name cannot print a
//   line that GitHub Actions reads as a workflow command: it escapes the newlines
//   that `::command::` needs, and the `##[command]` form, which works anywhere in
//   a line.
//
// Git's own environment is not inherited (`GIT_DIR`, `GIT_CONFIG_*` and the rest),
// so that it cannot point the check at another repository. What is out of this
// script's reach is the configuration in `.git/config` and the Git and Node.js it
// runs: whoever can change those can already run code as the user. They are not
// part of a pull request.

import { spawnSync } from "node:child_process";

/**
 * A path under `tests/acceptance*`, in any letter case and at any depth.
 *
 * A Windows checkout folds some differences that are separate paths for Git:
 * case (`Tests/Acceptance`, hence `i`, and `u` for characters such as `ſ` that
 * fold to ASCII), a backslash in a name committed on another OS, and dots or
 * spaces at the end of a directory name.
 */
const ACCEPTANCE_TEST = /(^|[/\\])tests[. ]*[/\\]acceptance[^/\\]*([/\\]|$)/iu;

// On Windows, Node.js looks for a program in the current directory before PATH,
// so a `git.exe` in the pull request would run instead of Git and could make the
// check pass. This variable makes it use PATH only, as in the justfile, and setting
// it here also covers running the script without `just`.
process.env.NoDefaultCurrentDirectoryInExePath = "1";

/** Exit code for a commit that breaks the rule. */
const EXIT_VIOLATION = 1;
/** Exit code for a check that could not run. */
const EXIT_CANNOT_CHECK = 2;

/** Oldest Git this works with: see the top of this file. */
const MINIMUM_GIT = [2, 43];

/**
 * The environment Git runs in: nothing that selects a repository or a configuration.
 */
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith("GIT_")),
);
// Refs under refs/replace can make a commit look like another one.
gitEnv.GIT_NO_REPLACE_OBJECTS = "1";

/** Formats untrusted text as one line, with nothing GitHub Actions would act on. */
function show(text) {
  return JSON.stringify(text).replaceAll("##[", "#\\u0023[");
}

/**
 * Runs Git without a shell and returns its exit status and standard output.
 * Throws, so that the check ends without a verdict, when Git cannot start or
 * exits with a status other than `allowedStatuses`.
 */
function runGit(args, allowedStatuses = [0]) {
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], {
    encoding: "utf8",
    // For `hash-object --stdin`; the other commands don't read it.
    input: "",
    // Large enough for any real listing; going over it is an error, not a
    // truncated list.
    maxBuffer: 1024 ** 3,
    env: gitEnv,
  });
  if (result.error) {
    throw new Error(`could not run Git: ${result.error.message}`);
  }
  if (!allowedStatuses.includes(result.status)) {
    const details = show(result.stderr.trim());
    throw new Error(`\`git ${args[0]}\` exited with ${result.status}: ${details}`);
  }
  return { status: result.status, stdout: result.stdout };
}

/** Lists the paths that differ between revisions, as `git diff-tree` takes them. */
function diffPaths(...revisions) {
  const { stdout } = runGit([
    "diff-tree",
    "-r",
    "-z",
    "--no-renames",
    "--no-commit-id",
    "--name-only",
    ...revisions,
  ]);
  return stdout.split("\0").filter(Boolean);
}

/** Stops the check on a Git that cannot leave out the repository's attributes. */
function requireMinimumGit() {
  const { stdout } = runGit(["version"]);
  const [, major, minor] = stdout.match(/^git version (\d+)\.(\d+)/) ?? [];
  const tooOld =
    Number(major) < MINIMUM_GIT[0] ||
    (Number(major) === MINIMUM_GIT[0] && Number(minor) < MINIMUM_GIT[1]);
  if (major === undefined || tooOld) {
    throw new Error(`Git ${MINIMUM_GIT.join(".")} or newer is needed, found ${show(stdout.trim())}`);
  }
}

/**
 * Makes Git read attributes from the empty tree, so not from the repository.
 * Run inside the repository: the hash of the empty tree depends on its format.
 */
function ignoreRepositoryAttributes() {
  gitEnv.GIT_ATTR_SOURCE = runGit(["hash-object", "-t", "tree", "--stdin"]).stdout.trim();
}

/**
 * Merges two commits as Git would by itself. Returns the resulting tree, which holds
 * conflict markers or one side for conflicts, and the paths in conflict.
 */
function automaticMerge(firstParent, secondParent) {
  // Exits with 1 when there are conflicts. The output is the tree, then the paths.
  const { stdout } = runGit(
    [
      "merge-tree",
      "--write-tree",
      "--allow-unrelated-histories",
      "--no-messages",
      "--name-only",
      "-z",
      firstParent,
      secondParent,
    ],
    [0, 1],
  );
  const [tree, ...conflicts] = stdout.split("\0").filter(Boolean);
  if (!/^[0-9a-f]{40,64}$/.test(tree?.trim() ?? "")) {
    throw new Error(`unexpected output from \`git merge-tree\`: ${show(stdout)}`);
  }
  return { tree: tree.trim(), conflicts };
}

/** Lists the paths a commit changed itself; see the top of this file for merges. */
function pathsChangedBy(commit, parents) {
  switch (parents.length) {
    case 0:
      return diffPaths("--root", commit);
    case 1:
      return diffPaths(parents[0], commit);
    case 2: {
      const { tree, conflicts } = automaticMerge(parents[0], parents[1]);
      return [...new Set([...conflicts, ...diffPaths(tree, commit)])];
    }
    default:
      return [...new Set(parents.flatMap((parent) => diffPaths(parent, commit)))];
  }
}

/** Returns a commit's subject exactly as Git shows it; leading spaces stay. */
function subjectOf(commit) {
  // `%s` joins the lines of the message's first paragraph into one.
  const { stdout } = runGit([
    "show",
    "-s",
    "--no-show-signature",
    "--encoding=UTF-8",
    "--format=%s",
    commit,
  ]);
  return stdout.replace(/\n$/, "");
}

/** Returns what is wrong with a commit, or nothing if it follows the rule. */
function findViolation(subject, paths) {
  const acceptanceTests = paths.filter((path) => ACCEPTANCE_TEST.test(path));
  if (acceptanceTests.length === 0) {
    return undefined;
  }
  if (!subject.startsWith("test(")) {
    return {
      reason: "changes acceptance tests, but its subject does not start with `test(`",
      paths: acceptanceTests,
    };
  }
  const otherFiles = paths.filter((path) => !ACCEPTANCE_TEST.test(path));
  if (otherFiles.length > 0) {
    return {
      reason: "is a `test(` commit that changes acceptance tests and also these other files",
      paths: otherFiles,
    };
  }
  return undefined;
}

/** Resolves a revision to a full commit hash, or nothing if it isn't one. */
function resolveCommit(revision) {
  // `--end-of-options` keeps a base such as `--all` from being read as an option,
  // and `--verify` accepts a single revision, so not a range such as `a..b`.
  const { status, stdout } = runGit(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${revision}^{commit}`],
    [0, 1],
  );
  return status === 0 ? stdout.trim() : undefined;
}

/** Runs the check and returns the exit code; throws if it cannot run. */
function check() {
  if (process.argv.length > 2) {
    throw new Error(
      "arguments are not read; use `just check-acceptance-tests <base>`, or set ACCEPTANCE_BASE",
    );
  }
  const baseName = process.env.ACCEPTANCE_BASE;
  if (!baseName) {
    throw new Error("no base given; use `just check-acceptance-tests <base>`");
  }
  requireMinimumGit();
  const shallow = runGit(["rev-parse", "--is-shallow-repository"]).stdout.trim();
  if (shallow !== "false") {
    throw new Error(
      "this is a shallow clone, so commits may be missing; fetch the whole history (`fetch-depth: 0` in CI, `git fetch --unshallow` locally)",
    );
  }
  ignoreRepositoryAttributes();
  const base = resolveCommit(baseName);
  if (!base) {
    throw new Error(`the base ${show(baseName)} is not a commit in this repository`);
  }
  const head = resolveCommit("HEAD");
  if (!head) {
    throw new Error("HEAD is not a commit");
  }
  if (runGit(["merge-base", base, head], [0, 1]).status !== 0) {
    throw new Error(`the base ${show(baseName)} has no history in common with HEAD`);
  }
  const lines = runGit(["rev-list", "--parents", head, `^${base}`])
    .stdout.split("\n")
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error(
      `HEAD has no commits that are not in the base ${show(baseName)}, so it is probably the wrong base`,
    );
  }

  let exitCode = 0;
  for (const line of lines) {
    const [commit, ...parents] = line.split(" ");
    const subject = subjectOf(commit);
    const violation = findViolation(subject, pathsChangedBy(commit, parents));
    if (violation) {
      exitCode = EXIT_VIOLATION;
      console.error(`${commit} ${show(subject)} ${violation.reason}:`);
      for (const path of violation.paths) {
        console.error(`  ${show(path)}`);
      }
    }
  }
  if (exitCode === 0) {
    console.log(`Acceptance tests: ${lines.length} commit(s) since ${base} checked, all fine.`);
  } else {
    console.error(
      'Acceptance tests may only change in commits of their own with a `test(` subject; see CONTRIBUTING.md, "Pull requests".',
    );
  }
  return exitCode;
}

try {
  process.exitCode = check();
} catch (error) {
  console.error(`Cannot check acceptance tests: ${error.message}`);
  process.exitCode = EXIT_CANNOT_CHECK;
}

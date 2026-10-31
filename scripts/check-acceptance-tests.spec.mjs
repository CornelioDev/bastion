// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Tests for check-acceptance-tests.mjs, with Node's own test runner. Each test
// builds a small Git repository in the system's temporary directory, ignoring
// the user's Git configuration, and runs the script in it. `just check` runs
// them (`just test-scripts`).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = fileURLToPath(new URL("check-acceptance-tests.mjs", import.meta.url));
const PASS = 0;
const VIOLATION = 1;
const CANNOT_CHECK = 2;

const RUST_TEST = "crates/bastion-core/tests/acceptance_t1_3.rs";
const DESKTOP_TEST = "apps/desktop/tests/acceptance/deep/er/timer.spec.ts";
const EXTENSION_TEST = "extension/tests/acceptance/popup.spec.ts";

const scratch = mkdtempSync(join(tmpdir(), "bastion-guard-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// An empty file: Git cannot read `os.devNull` as a configuration file on Windows.
const emptyConfig = join(scratch, "gitconfig");
writeFileSync(emptyConfig, "");

/** The environment for Git: nothing from this repository or from the user. */
const gitEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith("GIT_")),
);
Object.assign(gitEnv, {
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});

let repositories = 0;
/** A copy of the first repository, for the others: copying is faster than Git. */
let template;

/** A scratch repository on a new branch `work`, level with `main`. */
class Repo {
  constructor() {
    repositories += 1;
    this.dir = join(scratch, String(repositories));
    if (template) {
      cpSync(template, this.dir, { recursive: true });
      return;
    }
    mkdirSync(this.dir);
    this.git("init", "-q", "-b", "main");
    this.commit("chore: start", {
      "src/lib.rs": "one\ntwo\nthree\n",
      [RUST_TEST]: "one\ntwo\nthree\nfour\nfive\n",
      [DESKTOP_TEST]: "one\n",
      [EXTENSION_TEST]: "one\n",
    });
    this.git("switch", "-q", "-c", "work");
    template = join(scratch, "template");
    cpSync(this.dir, template, { recursive: true });
  }

  /** Runs Git and returns its result, whatever the exit status. */
  tryGit(...args) {
    return spawnSync("git", args, { cwd: this.dir, env: gitEnv, encoding: "utf8" });
  }

  /** Runs Git, which has to succeed, and returns its output. */
  git(...args) {
    const result = this.tryGit(...args);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  }

  /** Writes files without committing; a null content deletes the file. */
  write(files) {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(this.dir, path);
      if (content === null) {
        rmSync(fullPath);
      } else {
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content);
      }
    }
  }

  /** Writes files and commits everything with this subject. */
  commit(subject, files = {}) {
    this.write(files);
    this.git("add", "-A");
    this.git("commit", "-q", "--allow-empty", "-m", subject);
  }

  /**
   * Commits one more file in the top directory, under a name that a Windows file
   * system or index would refuse. Git's plumbing can still write it.
   */
  commitOddName(subject, name) {
    const blob = this.tryGit("hash-object", "-w", "src/lib.rs").stdout.trim();
    const entries = `${this.tryGit("ls-tree", "-z", "HEAD").stdout}100644 blob ${blob}\t${name}\0`;
    const tree = spawnSync("git", ["mktree", "-z"], {
      cwd: this.dir,
      env: gitEnv,
      encoding: "utf8",
      input: entries,
    }).stdout.trim();
    const commit = this.git("commit-tree", tree, "-p", "HEAD", "-m", subject);
    this.git("update-ref", "HEAD", commit);
  }

  /** Runs the script here; `base` is what the recipe would export, null for nothing. */
  guard(base = "main", args = [], cwd = this.dir, env = gitEnv) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      env: base === null ? env : { ...env, ACCEPTANCE_BASE: base },
      encoding: "utf8",
    });
  }

  /** Checks the script's exit code, showing its output when it is another one. */
  expect(status, base) {
    const result = this.guard(base);
    assert.equal(result.status, status, `${result.stdout}${result.stderr}`);
    return result;
  }
}

/** Declares tests that each make one commit in a new repository. */
function commitCases(status, cases) {
  for (const [name, subject, files] of cases) {
    test(`exit ${status}: ${name}`, () => {
      const repo = new Repo();
      repo.commit(subject, files);
      repo.expect(status);
    });
  }
}

commitCases(PASS, [
  ["a commit that changes no acceptance test", "feat(core): x", { "src/lib.rs": "new\n" }],
  ["a test( commit changing a Rust test", "test(core): x", { [RUST_TEST]: "new\n" }],
  ["a test( commit adding a nested test", "test(desktop): x", { [`${DESKTOP_TEST}.new`]: "new\n" }],
  ["a test( commit deleting a test", "test(extension): x", { [EXTENSION_TEST]: null }],
  ["a test( commit with no colon: the hook judges the format", "test(x", { [RUST_TEST]: "new\n" }],
  [
    "paths that only look like acceptance tests",
    "feat: x",
    {
      "crates/a/tests/unit/acceptance_t1.rs": "x",
      "crates/a/src/acceptance.rs": "x",
      "crates/a/mytests/acceptance_t1.rs": "x",
      "crates/a/tests/not_acceptance.rs": "x",
      "acceptance/tests/x.rs": "x",
    },
  ],
  [
    "a commit with hostile names outside acceptance paths",
    "feat: $(touch pwned) & echo pwned > pwned",
    { "a'$(touch pwned)'.rs": "x", "b & echo pwned.rs": "x" },
  ],
]);

commitCases(VIOLATION, [
  ["a Rust test modified outside test(", "feat(core): x", { [RUST_TEST]: "new\n" }],
  ["a Rust test added outside test(", "feat: x", { "crates/a/tests/acceptance_t9_9.rs": "x" }],
  ["a desktop test modified outside test(", "feat: x", { [DESKTOP_TEST]: "new\n" }],
  ["a desktop fixture added outside test(", "feat: x", { "apps/desktop/tests/acceptance/a/b.vue": "x" }],
  ["an extension test deleted outside test(", "fix: x", { [EXTENSION_TEST]: null }],
  ["a top-level tests/acceptance file", "feat: x", { "tests/acceptance.rs": "x" }],
  ["another letter case", "feat: x", { "crates/a/Tests/Acceptance_T1_1.RS": "x" }],
  ["a directory in capitals", "feat: x", { "extension/TESTS/ACCEPTANCE/x.ts": "x" }],
  ["subject `test: x`", "test: x", { [RUST_TEST]: "new\n" }],
  ["subject `Test(x)`", "Test(x): y", { [RUST_TEST]: "new\n" }],
  ["subject `TEST(x)`", "TEST(x): y", { [RUST_TEST]: "new\n" }],
  ["subject `fix: test(x)`", "fix: test(x)", { [RUST_TEST]: "new\n" }],
  ["subject `tests(x)`", "tests(x): y", { [RUST_TEST]: "new\n" }],
  ["a subject with a space before test(", " test(x): y", { [RUST_TEST]: "new\n" }],
  ["subject `fixup! test(x)`", "fixup! test(x): y", { [RUST_TEST]: "new\n" }],
  ['subject `Revert "test(x)"`', 'Revert "test(x): y"', { [RUST_TEST]: "new\n" }],
  [
    "a test( commit that also changes product code",
    "test(core): x",
    { [RUST_TEST]: "new\n", "src/lib.rs": "new\n" },
  ],
]);

test("exit 1: a file renamed out of an acceptance path", () => {
  const repo = new Repo();
  repo.git("mv", EXTENSION_TEST, "extension/popup.spec.ts");
  repo.commit("refactor: x");
  assert.match(repo.git("show", "--name-status", "-M", "--format="), /^R\d+/);
  repo.expect(VIOLATION);
});

test("exit 1: a file moved into an acceptance path", () => {
  const repo = new Repo();
  repo.commit("refactor: x", {
    "src/lib.rs": null,
    "crates/a/tests/acceptance_t1_1.rs": "one\ntwo\nthree\n",
  });
  assert.match(repo.git("show", "--name-status", "-M", "--format="), /^R\d+/);
  repo.expect(VIOLATION);
});

test("exit 1: a test( rename out of an acceptance path also changes another path", () => {
  const repo = new Repo();
  repo.git("mv", EXTENSION_TEST, "extension/popup.spec.ts");
  repo.commit("test(extension): x");
  repo.expect(VIOLATION);
});

test("exit 0: a test( rename between acceptance paths", () => {
  const repo = new Repo();
  repo.git("mv", EXTENSION_TEST, "extension/tests/acceptance/renamed.spec.ts");
  repo.commit("test(extension): x");
  repo.expect(PASS);
});

test("exit 1: only the file mode of a test changed", () => {
  const repo = new Repo();
  repo.git("update-index", "--chmod=+x", RUST_TEST);
  repo.git("commit", "-q", "-m", "chore: x");
  repo.expect(VIOLATION);
});

test("exit 1: one bad commit among good ones, and it is the one reported", () => {
  const repo = new Repo();
  repo.commit("test(core): x", { [RUST_TEST]: "a\n" });
  repo.commit("feat(core): the bad one", { [RUST_TEST]: "b\n" });
  repo.commit("feat(core): y", { "src/lib.rs": "new\n" });
  const { stderr } = repo.expect(VIOLATION);
  assert.match(stderr, /the bad one/);
  assert.doesNotMatch(stderr, /"test\(core\): x"/);
  assert.doesNotMatch(stderr, /"feat\(core\): y"/);
});

test("exit 1: a name with a backslash, as committed on another OS", () => {
  const repo = new Repo();
  repo.commitOddName("feat: x", "tests\\acceptance\\x.rs");
  repo.expect(VIOLATION);
});

test("exit 1: a directory name that Windows would shorten", () => {
  const repo = new Repo();
  repo.commitOddName("feat: x", "tests. \\acceptance_t1.rs");
  repo.expect(VIOLATION);
});

test("exit 1: a hostile acceptance file name runs nothing and prints one line each", () => {
  const repo = new Repo();
  repo.commitOddName(
    "feat: ##[error]from the subject $(touch pwned)",
    'tests\\acceptance$(touch pwned)"\n::error::injected ##[command]from the name',
  );
  const { stderr } = repo.expect(VIOLATION);
  assert.doesNotMatch(stderr, /^\s*::/m);
  assert.doesNotMatch(stderr, /##\[/);
  assert.equal(existsSync(join(repo.dir, "pwned")), false);
});

test("exit 0: a merge from main bringing in a squash commit that changes a test", () => {
  const repo = new Repo();
  repo.commit("feat: on the branch", { "src/other.rs": "x" });
  repo.git("switch", "-q", "main");
  repo.commit("feat(core): squash-merged task", { [RUST_TEST]: "new\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into work", "main");
  repo.expect(PASS);
});

test("exit 0: a merge resolving a conflict in product code only", () => {
  const repo = new Repo();
  repo.commit("feat: branch side", { "src/lib.rs": "branch\n" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { "src/lib.rs": "main\n", [RUST_TEST]: "new\n" });
  repo.git("switch", "-q", "work");
  assert.equal(repo.tryGit("merge", "-q", "main").status, 1);
  repo.commit("Merge branch 'main' into work", { "src/lib.rs": "both\n" });
  repo.expect(PASS);
});

test("exit 0: a clean merge of two test( commits changing one test", () => {
  const repo = new Repo();
  repo.commit("test(core): first", { [RUST_TEST]: "1\ntwo\nthree\nfour\nfive\n" });
  repo.git("switch", "-q", "-c", "side", "main");
  repo.commit("test(core): last", { [RUST_TEST]: "one\ntwo\nthree\nfour\n5\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "-m", "Merge branch 'side' into work", "side");
  repo.expect(PASS);
});

test("exit 1: a merge with a hand-made change to an untouched test (evil merge)", () => {
  const repo = new Repo();
  repo.commit("feat: on the branch", { "src/other.rs": "x" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: on main", { "src/main-only.rs": "x" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-commit", "--no-ff", "main");
  repo.commit("Merge branch 'main' into work", { [EXTENSION_TEST]: "weakened\n" });
  repo.expect(VIOLATION);
});

test("exit 1: a merge with a hand-made change on top of main's change to a test", () => {
  const repo = new Repo();
  repo.git("switch", "-q", "main");
  repo.commit("feat(core): squash-merged task", { [RUST_TEST]: "from main\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-commit", "--no-ff", "main");
  repo.commit("Merge branch 'main' into work", { [RUST_TEST]: "from main, weakened\n" });
  repo.expect(VIOLATION);
});

test("exit 1: a merge throwing away main's change to a test (`-s ours`)", () => {
  const repo = new Repo();
  repo.commit("feat: on the branch", { "src/other.rs": "x" });
  repo.git("switch", "-q", "main");
  repo.commit("test(core): stronger test", { [RUST_TEST]: "stronger\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "-s", "ours", "-m", "Merge branch 'main' into work", "main");
  // `--cc` shows nothing here: the file matches one parent.
  assert.equal(repo.git("diff-tree", "--cc", "--name-only", "--no-commit-id", "HEAD"), "");
  repo.expect(VIOLATION);
});

test("exit 1: a merge resolving a conflict in an acceptance test", () => {
  const repo = new Repo();
  repo.commit("test(core): branch side", { [RUST_TEST]: "branch\n" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { [RUST_TEST]: "main\n" });
  repo.git("switch", "-q", "work");
  assert.equal(repo.tryGit("merge", "-q", "main").status, 1);
  repo.commit("Merge branch 'main' into work", { [RUST_TEST]: "both\n" });
  repo.expect(VIOLATION);
});

test("exit 0: the same conflict resolved in a merge with a test( subject", () => {
  const repo = new Repo();
  repo.commit("test(core): branch side", { [RUST_TEST]: "branch\n" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { [RUST_TEST]: "main\n" });
  repo.git("switch", "-q", "work");
  assert.equal(repo.tryGit("merge", "-q", "main").status, 1);
  repo.commit("test(core): merge main", { [RUST_TEST]: "both\n" });
  repo.expect(PASS);
});

/**
 * Starts a conflict between `work` and `main` on a file, each side given as its
 * content or null to delete it, and leaves the merge unfinished.
 */
function conflictOn(path, ours, theirs) {
  const repo = new Repo();
  repo.commit("test(core): branch side", { [path]: ours });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { [path]: theirs });
  repo.git("switch", "-q", "work");
  assert.equal(repo.tryGit("merge", "-q", "main").status, 1);
  return repo;
}

const BINARY_FIXTURE = "apps/desktop/tests/acceptance/fixtures/data.bin";

// Each resolution is what stays in the merge. The file's state in Git's automatic
// tree is one side, so one of each pair passed when only tree differences counted.
for (const [name, path, ours, theirs, keep] of [
  ["modify/delete, keeping the edit", RUST_TEST, "edited\n", null, "ours"],
  ["modify/delete, deleting the file", RUST_TEST, "edited\n", null, "theirs"],
  ["delete/modify, keeping main's file", RUST_TEST, null, "edited\n", "theirs"],
  ["delete/modify, deleting the file", RUST_TEST, null, "edited\n", "ours"],
  ["a binary fixture, keeping ours", BINARY_FIXTURE, "w\0\n", "m\0\n", "ours"],
  ["a binary fixture, keeping theirs", BINARY_FIXTURE, "w\0\n", "m\0\n", "theirs"],
]) {
  const finish = (repo, subject) => {
    const content = keep === "ours" ? ours : theirs;
    if (content === null) {
      repo.git("rm", "-q", "-f", "--ignore-unmatch", path);
    } else {
      repo.write({ [path]: content });
      repo.git("add", path);
    }
    repo.git("commit", "-q", "-m", subject);
  };

  test(`exit 1: a merge resolving a conflict in ${name}`, () => {
    const repo = conflictOn(path, ours, theirs);
    finish(repo, "Merge branch 'main' into work");
    repo.expect(VIOLATION);
  });

  test(`exit 0: under a test( subject, a merge resolving ${name}`, () => {
    const repo = conflictOn(path, ours, theirs);
    finish(repo, "test(core): merge main");
    repo.expect(PASS);
  });
}

test("exit 0: a merge keeping one side of a modify/delete conflict in product code", () => {
  const repo = conflictOn("src/lib.rs", "edited\n", null);
  repo.git("add", "src/lib.rs");
  repo.git("commit", "-q", "-m", "Merge branch 'main' into work");
  repo.expect(PASS);
});

test("exit 1: a test( merge resolving conflicts in a test and in product code", () => {
  const repo = new Repo();
  repo.commit("test(core): branch side", { [RUST_TEST]: "branch\n" });
  repo.commit("feat: branch side", { "src/lib.rs": "branch\n" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { [RUST_TEST]: "main\n", "src/lib.rs": "main\n" });
  repo.git("switch", "-q", "work");
  assert.equal(repo.tryGit("merge", "-q", "main").status, 1);
  repo.git("checkout", "--ours", "--", RUST_TEST, "src/lib.rs");
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "test(core): merge main");
  repo.expect(VIOLATION);
});

test("exit 1: `merge=binary` in .gitattributes hiding a merge that throws away a change", () => {
  const repo = new Repo();
  repo.commit("test(core): branch side", { [RUST_TEST]: "1\ntwo\nthree\nfour\nfive\n" });
  repo.git("switch", "-q", "main");
  repo.commit("test(core): main side", { [RUST_TEST]: "one\ntwo\nthree\nfour\n5\n" });
  repo.git("switch", "-q", "work");
  repo.commit("chore: attributes", { ".gitattributes": `${RUST_TEST} merge=binary\n` });
  repo.git("merge", "-q", "-s", "ours", "-m", "Merge branch 'main' into work", "main");
  repo.expect(VIOLATION);
});

test("exit 1: `merge=union` in .gitattributes making a conflict in a test look clean", () => {
  const repo = new Repo();
  repo.commit("chore: attributes", { ".gitattributes": `${RUST_TEST} merge=union\n` });
  repo.commit("test(core): branch side", { [RUST_TEST]: "branch\n" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: main side", { [RUST_TEST]: "main\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into work", "main");
  repo.expect(VIOLATION);
});

test("exit 1: a replace ref showing a bad commit as a harmless one", () => {
  const repo = new Repo();
  repo.commit("feat: bad", { [RUST_TEST]: "weakened\n" });
  const bad = repo.git("rev-parse", "HEAD");
  const tree = repo.git("rev-parse", "main^{tree}");
  const harmless = repo.git("commit-tree", tree, "-p", "main", "-m", "feat: harmless");
  repo.git("replace", bad, harmless);
  assert.match(repo.git("log", "-1", "--format=%s"), /harmless/);
  repo.expect(VIOLATION);
});

test("exit 1: GIT_DIR pointing at a repository where the branch would pass", () => {
  const repo = new Repo();
  repo.commit("feat: bad", { [RUST_TEST]: "weakened\n" });
  const other = new Repo();
  other.commit("feat: fine");
  const result = repo.guard("main", [], repo.dir, {
    ...gitEnv,
    GIT_DIR: join(other.dir, ".git"),
    GIT_WORK_TREE: other.dir,
  });
  assert.equal(result.status, VIOLATION, `${result.stdout}${result.stderr}`);
});

test("exit 1 and 0: a SHA-256 repository, with its own empty tree and merge", () => {
  const dir = join(scratch, `${repositories}-sha256`);
  mkdirSync(dir);
  const repo = Object.create(Repo.prototype);
  repo.dir = dir;
  repo.git("init", "-q", "-b", "main", "--object-format=sha256");
  repo.commit("chore: start", { "src/lib.rs": "one\n" });
  repo.git("switch", "-q", "-c", "work");
  repo.commit("feat: on the branch", { "src/other.rs": "x" });
  repo.git("switch", "-q", "main");
  repo.commit("feat: on main", { "src/main-only.rs": "x" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into work", "main");
  repo.expect(PASS);
  repo.commit("feat: bad", { [RUST_TEST]: "x" });
  repo.expect(VIOLATION);
});

test("exit 1: a merge of three branches that changes a test", () => {
  const repo = new Repo();
  repo.git("switch", "-q", "-c", "side1", "main");
  repo.commit("feat: side 1", { "src/one.rs": "x" });
  repo.git("switch", "-q", "-c", "side2", "main");
  repo.commit("test(core): side 2", { [RUST_TEST]: "new\n" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "-m", "Merge side1 and side2", "side1", "side2");
  repo.expect(VIOLATION);
});

test("exit 1: a merged-in history whose first commit adds a test", () => {
  const repo = new Repo();
  repo.git("switch", "-q", "--orphan", "other");
  repo.commit("feat: unrelated root", { "tests/acceptance_t1.rs": "x" });
  repo.git("switch", "-q", "work");
  repo.git("merge", "-q", "--no-ff", "--allow-unrelated-histories", "-m", "Merge other", "other");
  repo.expect(VIOLATION);
});

for (const [name, base] of [
  ["an unknown base", "does-not-exist"],
  ["an empty base", ""],
  ["a base that looks like an option", "--all"],
  ["a range as the base", "main..work"],
  ["a base that tries to run a command", "main$(touch pwned)"],
  ["a base with cmd.exe metacharacters", 'main" & echo pwned > pwned & "'],
  ["a blob as the base", "HEAD:src/lib.rs"],
]) {
  test(`exit 2: ${name}`, () => {
    const repo = new Repo();
    repo.commit("feat: x");
    const { stderr } = repo.expect(CANNOT_CHECK, base);
    assert.match(stderr, /Cannot check acceptance tests/);
    assert.equal(existsSync(join(repo.dir, "pwned")), false);
  });
}

test("exit 2: no base at all", () => {
  const repo = new Repo();
  repo.commit("feat: x");
  const result = repo.guard(null);
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
});

test("exit 2: the base as an argument, which is not read", () => {
  const repo = new Repo();
  repo.commit("feat: x");
  const result = repo.guard(null, ["main"]);
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
});

test("exit 2: a range with no commits", () => {
  const repo = new Repo();
  repo.expect(CANNOT_CHECK);
});

test("exit 2: HEAD behind the base", () => {
  const repo = new Repo();
  repo.git("switch", "-q", "main");
  repo.commit("feat: x");
  repo.git("switch", "-q", "work");
  repo.expect(CANNOT_CHECK);
});

test("exit 2: a base with no history in common", () => {
  const repo = new Repo();
  repo.git("switch", "-q", "--orphan", "other");
  repo.commit("feat: unrelated", { [RUST_TEST]: "new\n" });
  repo.expect(CANNOT_CHECK);
});

test("exit 2: a shallow clone, as CI checks out by default", () => {
  const repo = new Repo();
  repo.commit("feat: bad", { [RUST_TEST]: "new\n" });
  const clone = join(scratch, `${repositories}-shallow`);
  repo.git("clone", "-q", "--depth", "1", "--no-single-branch", pathToFileURL(repo.dir).href, clone);
  const result = repo.guard("origin/main", [], clone);
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
  assert.match(result.stderr, /shallow/);
});

test("exit 2: not in a Git repository", () => {
  const repo = new Repo();
  const outside = join(scratch, `${repositories}-outside`);
  mkdirSync(outside);
  const result = repo.guard("main", [], outside, {
    ...gitEnv,
    GIT_CEILING_DIRECTORIES: scratch,
  });
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
});

test("exit 2: Git is not installed", () => {
  const repo = new Repo();
  repo.commit("feat: x");
  const env = { ...gitEnv };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase() === "PATH") {
      delete env[name];
    }
  }
  const result = repo.guard("main", [], repo.dir, { ...env, PATH: join(repo.dir, "empty") });
  assert.equal(result.status, CANNOT_CHECK, result.stderr);
});

test(
  "exit 1: a git.exe in the repository does not run instead of Git",
  { skip: process.platform !== "win32" },
  () => {
    const repo = new Repo();
    repo.commit("feat: x", { [RUST_TEST]: "new\n" });
    const fake = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe");
    cpSync(fake, join(repo.dir, "git.exe"));
    const env = Object.fromEntries(
      Object.entries(gitEnv).filter(([name]) => name !== "NoDefaultCurrentDirectoryInExePath"),
    );
    const result = repo.guard("main", [], repo.dir, env);
    assert.equal(result.status, VIOLATION, result.stderr);
  },
);

test("exit 2: a commit object is missing", () => {
  const repo = new Repo();
  repo.commit("feat: first");
  const missing = repo.git("rev-parse", "HEAD");
  repo.commit("feat: second");
  rmSync(join(repo.dir, ".git", "objects", missing.slice(0, 2), missing.slice(2)), { force: true });
  repo.expect(CANNOT_CHECK);
});

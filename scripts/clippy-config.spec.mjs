// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Checks that the clippy.toml of keitora-core and keitora-ipc keeps up with the root one,
// with Node's own test runner. Clippy reads only the clippy.toml nearest a crate, so those
// two files replace the root one instead of adding to it, and have to repeat its settings
// (see the top of crates/keitora-core/clippy.toml). These tests fail when they drift.
//
// `just check` runs them (`just test-scripts`).
//
// The files are read in the narrow form they are written in: comments on their own lines,
// booleans, numbers and strings as `key = value` on one line, and arrays with one
// `{ ... },` entry per line. Anything else fails the test, so that a change of format is
// noticed rather than read wrongly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** Reads a file relative to the root of the workspace. */
function read(path) {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

const ROOT = "clippy.toml";
const CRATES = ["crates/keitora-core/clippy.toml", "crates/keitora-ipc/clippy.toml"];

/** What the crates ban on top of the root file: no system clock, no processes (L5). */
const PURE_BANS = {
  "disallowed-methods": [
    "std::time::SystemTime::now",
    "std::time::SystemTime::elapsed",
    "std::time::Instant::now",
    "std::time::Instant::elapsed",
    "chrono::Utc::now",
    "chrono::Local::now",
    "std::process::Command::new",
    "std::process::exit",
    "std::process::abort",
  ],
  "disallowed-types": ["std::process::Command", "std::process::Child"],
};

/**
 * Parses a clippy.toml in the narrow form described at the top of this file, into a map
 * from each key to its value: a string for a scalar, an array of entry texts for an array.
 */
function parse(text) {
  const settings = new Map();
  let array = null;
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    const where = `line ${index + 1}: ${JSON.stringify(raw)}`;
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (array !== null) {
      if (line === "]") {
        array = null;
      } else if (/^\{[^{}]*\},$/.test(line)) {
        array.push(line.slice(0, -1));
      } else {
        throw new Error(`not one \`{ ... },\` entry per line, ${where}`);
      }
      continue;
    }
    const match = /^([a-z-]+) = (.+)$/.exec(line);
    if (match === null) {
      throw new Error(`not \`key = value\`, ${where}`);
    }
    const [, key, value] = match;
    if (settings.has(key)) {
      throw new Error(`\`${key}\` is set twice, ${where}`);
    }
    if (value === "[") {
      array = [];
      settings.set(key, array);
    } else if (/^(true|false|d+|"[^"]*")$/.test(value)) {
      settings.set(key, value);
    } else {
      throw new Error(`not a boolean, number, string or array on its own lines, ${where}`);
    }
  }
  if (array !== null) {
    throw new Error("an array isn't closed");
  }
  return settings;
}

/** The `path` of every entry in an array setting. */
function paths(entries) {
  return (entries ?? []).map((entry) => /path = "([^"]*)"/.exec(entry)?.[1]);
}

test("the clippy.toml of keitora-core and keitora-ipc are identical", () => {
  const [core, ipc] = CRATES.map(read);
  assert.equal(ipc, core, `${CRATES[1]} differs from ${CRATES[0]}`);
});

for (const crate of CRATES) {
  test(`${crate} repeats every setting of the root clippy.toml`, () => {
    const root = parse(read(ROOT));
    const own = parse(read(crate));
    assert.ok(root.size > 0, "the root clippy.toml has no settings");
    for (const [key, value] of root) {
      if (Array.isArray(value)) {
        const ownEntries = own.get(key);
        assert.ok(Array.isArray(ownEntries), `\`${key}\` is missing or isn't an array`);
        const missing = value.filter((entry) => !ownEntries.includes(entry));
        assert.deepEqual(missing, [], `\`${key}\` lacks entries of the root file`);
      } else {
        assert.equal(own.get(key), value, `\`${key}\` differs from the root file`);
      }
    }
  });

  test(`${crate} bans reading the system clock and starting processes`, () => {
    const own = parse(read(crate));
    for (const [key, banned] of Object.entries(PURE_BANS)) {
      const listed = paths(own.get(key));
      const missing = banned.filter((path) => !listed.includes(path));
      assert.deepEqual(missing, [], `\`${key}\` lacks bans`);
    }
  });
}

test("the parser rejects what it can't read, instead of skipping it", () => {
  assert.equal(parse("# a comment\n\nflag = true\n").get("flag"), "true");
  assert.deepEqual(parse('list = [\n    { path = "a" },\n]\n').get("list"), ['{ path = "a" }']);
  assert.throws(() => parse("[table]\n"), /not `key = value`/);
  assert.throws(() => parse("list = [\n    { path = \"a\" }, { path = \"b\" },\n]\n"), /entry per line/);
  assert.throws(() => parse('list = ["a", "b"]\n'), /not a boolean/);
  assert.throws(() => parse("list = [\n    { path = \"a\" },\n"), /isn't closed/);
  assert.throws(() => parse("flag = true\nflag = false\n"), /set twice/);
});

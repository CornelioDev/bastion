// SPDX-License-Identifier: MIT OR Apache-2.0

import { describe, expect, it } from "vitest";

import { manifestVersion } from "./manifest-version";

/** Compares two manifest versions as a browser does, number by number. */
function compareVersions(a: string, b: string): number {
  const right = b.split(".").map(Number);
  for (const [index, part] of a.split(".").map(Number).entries()) {
    const difference = part - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

describe("manifestVersion", () => {
  it.each([
    ["0.1.0-beta.1", "0.1.0.1"],
    ["0.1.0-beta.12", "0.1.0.12"],
    ["1.2.3-beta.65534", "1.2.3.65534"],
    ["0.1.0", "0.1.0.65535"],
    ["0.0.0", "0.0.0.65535"],
  ])("makes %s into %s", (projectVersion, expected) => {
    expect(manifestVersion(projectVersion)).toBe(expected);
  });

  it("keeps the order of releases, so that browsers and stores update", () => {
    const inOrder = [
      "0.1.0-beta.1",
      "0.1.0-beta.2",
      "0.1.0",
      "0.1.1-beta.1",
      "0.1.1",
      "0.2.0-beta.1",
    ].map(manifestVersion);

    for (const [index, version] of inOrder.slice(1).entries()) {
      expect(compareVersions(version, inOrder[index])).toBeGreaterThan(0);
    }
  });

  it.each([
    "",
    "1.2",
    "1.2.3.4",
    "1.2.3-beta",
    "1.2.3-beta.0",
    "1.2.3-beta.65535",
    "1.2.3-rc.1",
    "1.2.3+build",
    "65536.0.0",
    "0.65536.0",
    "0.0.65536",
  ])("rejects %j", (projectVersion) => {
    expect(() => manifestVersion(projectVersion)).toThrow(
      `"${projectVersion}"`,
    );
  });
});

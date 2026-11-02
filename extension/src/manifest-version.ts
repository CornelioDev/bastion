// SPDX-License-Identifier: MIT OR Apache-2.0

/** The largest number browsers accept in each part of a manifest's `version`. */
const MAX_PART = 65535;

/**
 * Turns the project's version into the `version` of the built manifest.
 *
 * Browsers only accept one to four numbers there, so `0.1.0-beta.1` can't be used
 * as it is, and a store only accepts an update with a higher version. So a beta
 * keeps its number in the fourth place and a final version takes the largest one:
 * `0.1.0-beta.1` < `0.1.0-beta.2` < `0.1.0` < `0.1.1-beta.1` become `0.1.0.1` <
 * `0.1.0.2` < `0.1.0.65535` < `0.1.1.1`.
 *
 * @throws If the version isn't `x.y.z` or `x.y.z-beta.n`, or doesn't fit. This
 * stops the build, because any other form could break that order.
 */
export function manifestVersion(projectVersion: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.([1-9]\d*))?$/.exec(
    projectVersion,
  );
  if (!match) {
    throw new Error(`Can't make a manifest version from "${projectVersion}"`);
  }

  const [major, minor, patch, beta] = match.slice(1);
  const release = [major, minor, patch].map(Number);
  // Beta 65535 would be the same version as the final one.
  const fits =
    release.every((part) => part <= MAX_PART) &&
    (beta === undefined || Number(beta) < MAX_PART);
  if (!fits) {
    throw new Error(`Can't make a manifest version from "${projectVersion}"`);
  }

  return [...release, beta ?? MAX_PART].join(".");
}

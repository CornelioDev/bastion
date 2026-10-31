// SPDX-License-Identifier: MIT OR Apache-2.0
//
// Runs `pnpm audit` in `apps/desktop` and in `extension`, each one even if the other
// fails, so that a run shows every advisory. A justfile recipe stops at its first failing
// line, which would hide the second package. Run it through its recipe:
//
//     just npm-audit
//
// Exit codes:
// - 0: pnpm reported no problem in either package.
// - 1: pnpm failed in at least one, with an advisory or by not being able to ask the
//   registry. Its own output says which. This is never a pass.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = ["apps/desktop", "extension"];

// cmd.exe looks for a command in the current directory before PATH, so a `pnpm.cmd` in
// the repository would run instead of pnpm. This variable makes it use PATH only, as in
// the justfile, and setting it here also covers running the script without `just`.
process.env.NoDefaultCurrentDirectoryInExePath = "1";

let failed = false;
for (const directory of PACKAGES) {
  console.log(`pnpm audit: ${directory}`);
  // Through a shell because an install of pnpm can be a `pnpm.cmd`, which Windows only
  // starts through one. The command is a constant: nothing from outside is in it.
  const result = spawnSync(`pnpm --dir ${directory} audit`, {
    shell: true,
    cwd: REPOSITORY_ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`pnpm audit failed in ${directory}`);
  }
}
process.exitCode = failed ? 1 : 0;

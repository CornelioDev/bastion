# SPDX-License-Identifier: MIT OR Apache-2.0
#
# Project commands, run with just (https://just.systems). `just check` is the
# single gate used by contributors, agents and CI; `just --list` shows every
# recipe.
#
# How a failure stops the run: just gives each line of a recipe its own shell,
# and stops at the first line that exits with anything other than 0, skipping
# the rest of the recipe and the recipes after it. just then exits non-zero as
# well. This only works if a line's exit code is that of its command, so keep
# one command per line, without `&&`, `|` or `;`.

# Windows runs each line with cmd.exe, which returns the exit code of the
# command it ran. It is the one shell that fits all of this:
# - `sh`, just's default, is not on PATH in cmd.exe or PowerShell with a default
#   install of Git for Windows.
# - PowerShell's execution policy can block the `pnpm.ps1` that an npm install
#   of pnpm creates.
#
# `/d` skips any AutoRun command set in the registry, so that a user's cmd.exe
# configuration cannot change the result.
set windows-shell := ["cmd.exe", "/d", "/c"]

# cmd.exe looks for a command in the current directory before PATH, so a
# `cargo.cmd` or `pnpm.cmd` in the repository would run instead of the real
# tool and could make every check pass. This variable makes it use PATH only.
export NoDefaultCurrentDirectoryInExePath := "1"

# Run every check; stops at the first failure
check: fmt clippy test deny desktop extension

# Check the formatting of the Rust code
fmt:
    cargo fmt --all --check

# Lint the Rust code; warnings are errors
clippy:
    cargo clippy --locked --workspace --all-targets -- -D warnings

# Run the Rust tests
test:
    cargo test --workspace --locked

# Check Rust dependencies: licenses, advisories, duplicates, sources
deny:
    cargo deny --locked check

# Lint, typecheck and test the desktop app
desktop:
    pnpm --dir apps/desktop install --frozen-lockfile
    pnpm --dir apps/desktop lint
    pnpm --dir apps/desktop typecheck
    pnpm --dir apps/desktop test

# Lint, typecheck, test and build the extension
extension:
    pnpm --dir extension install --frozen-lockfile
    pnpm --dir extension lint
    pnpm --dir extension typecheck
    pnpm --dir extension test
    pnpm --dir extension build

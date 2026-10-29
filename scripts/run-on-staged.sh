# SPDX-License-Identifier: MIT OR Apache-2.0
#
# Runs a command on the staged files with the given extensions. lefthook's
# pre-commit jobs use it (see lefthook.yml):
#
#     sh scripts/run-on-staged.sh [-C <dir>] [-x <file>]... -e '<extensions>' \
#         <command> [<argument>...]
#
# - -C <dir>: only files under this directory (relative to the repository
#   root), and the command runs there. Defaults to the repository root.
# - -x <file>: leave out this file, relative to <dir>. Can be repeated.
# - -e '<extensions>': space-separated, without dots, such as 'ts vue'.
#
# The file names are appended to the command, each as one argument, relative
# to <dir> and starting with `./`, so that a file named like `--emit=files.rs`
# cannot be read as an option. When no staged file matches, the command does
# not run and the script exits with 0. Otherwise it exits with 0 only if the
# command succeeds.
#
# Why not lefthook's `{staged_files}`: lefthook puts the names into a shell
# command line, and on Windows its quoting breaks on names containing a
# single quote, so a name such as `x'$(cmd)'.rs` would run `cmd`. Here the
# names travel from Git to the command separated by NUL bytes and never pass
# through a shell.
#
# Like lefthook's own file lists, this reads the list of staged files, but the
# command checks the files in the working tree, so a partially staged file is
# checked as it is on disk.

set -eu
# Fail when Git fails, not only when the command does. pipefail is newer than
# some sh implementations, so it is only turned on where it exists.
if (set -o pipefail) 2>/dev/null; then
    set -o pipefail
fi
# The extensions and exclusions below are split on spaces on purpose; without
# this, the `*` in the patterns would be expanded against the current
# directory.
set -f

usage() {
    echo "usage: sh scripts/run-on-staged.sh [-C <dir>] [-x <file>]... -e '<extensions>' <command> [<argument>...]" >&2
    exit 2
}

dir=.
excludes=
extensions=
while getopts 'C:x:e:' option; do
    case $option in
    C) dir=$OPTARG ;;
    x) excludes="$excludes $OPTARG" ;;
    e) extensions=$OPTARG ;;
    *) usage ;;
    esac
done
shift $((OPTIND - 1))
if [ -z "$extensions" ] || [ "$#" -eq 0 ]; then
    usage
fi

# A package that does not exist has nothing staged.
if [ ! -d "$dir" ]; then
    exit 0
fi
cd "$dir"

# Git pathspecs: `**/*.ts` matches at any depth, including directly in <dir>.
pathspecs=
for extension in $extensions; do
    pathspecs="$pathspecs :(glob)**/*.$extension"
done
for exclude in $excludes; do
    pathspecs="$pathspecs :(exclude)$exclude"
done

# Added, copied, modified or renamed files (not deleted ones), NUL-separated.
# Run from <dir>, `--relative` keeps only the files under it and prints their
# paths relative to it. `xargs -0 -r` passes them on as separate arguments and
# does not run the command when there are none; it splits a very long list
# over several runs of the command, and fails if any of them fails.
# shellcheck disable=SC2086 # $pathspecs is split on purpose, see `set -f` above.
git diff --cached --name-only --diff-filter=ACMR -z --relative --line-prefix=./ -- $pathspecs |
    xargs -0 -r "$@"

# SPDX-License-Identifier: MIT OR Apache-2.0
#
# Checks that a commit message follows Conventional Commits
# (https://www.conventionalcommits.org), as CONTRIBUTING.md ("Commits")
# describes. lefthook runs it as the commit-msg hook (see lefthook.yml); it
# can also be run by hand:
#
#     sh scripts/check-commit-msg.sh <file-with-the-message>
#
# Without an argument, it reads the path of the file from the first line of
# standard input instead. lefthook.yml uses that form, because lefthook's
# quoting of arguments breaks on Windows when the path contains a single
# quote.
#
# Only the first line, the subject, is checked. It must look like
#
#     <type>(<scope>)!: <description>
#
# - type: one of the types in `types` below.
# - (<scope>): optional. Lowercase letters, digits and hyphens, such as `core`
#   or `deps`. Any such scope is accepted, not only the ones CONTRIBUTING.md
#   lists.
# - !: optional. Marks a breaking change.
# - description: required, after a colon and one space.
#
# Subjects that Git writes itself are accepted as they are: merges
# ("Merge ..."), reverts ('Revert "..."'), and the "fixup! ", "squash! " and
# "amend! " commits made by `git commit --fixup` or `--squash`, which
# `git rebase --autosquash` folds into the commit they fix.
#
# Exits with 0 when the message is accepted, 1 when it is not, and 2 when the
# script is called incorrectly. Plain POSIX sh, so that it runs with the sh
# that comes with Git for Windows and needs nothing else installed.

set -eu

# In the C locale, `[a-z]` means the 26 lowercase ASCII letters and nothing
# else.
LC_ALL=C
export LC_ALL

types='feat|fix|docs|refactor|test|perf|build|ci|chore'

usage() {
    echo "usage: sh scripts/check-commit-msg.sh <commit-message-file>" >&2
    exit 2
}

case $# in
0)
    # Typed at a terminal, the missing argument is a mistake, not a path to
    # wait for.
    if [ -t 0 ]; then
        usage
    fi
    IFS= read -r message_file || true
    ;;
1) message_file=$1 ;;
*) usage ;;
esac
if [ -z "$message_file" ] || [ ! -r "$message_file" ]; then
    usage
fi

# Git starts comment lines with `#`, unless core.commentString (or its older
# name, core.commentChar) says otherwise. With "auto", Git picks a character
# that no line of the message starts with; that case is not handled, and `#`
# is assumed.
comment=$(git config --get core.commentString 2>/dev/null ||
    git config --get core.commentChar 2>/dev/null || true)
case $comment in
'' | auto) comment='#' ;;
esac

# The subject is the first line that is neither blank nor a comment. Git
# removes blank lines at the start and comment lines (the instructions it puts
# in the editor) when it creates the commit, but the hook sees the message
# before that. With `git commit -v`, everything from the scissors line on is
# the diff Git showed in the editor, and Git removes it too. `tr` removes
# carriage returns, in case an editor saved the file with Windows (CRLF) line
# endings. The comment string reaches awk through the environment because
# `awk -v` would interpret backslashes in it.
subject=$(tr -d '\r' <"$message_file" | COMMENT=$comment awk '
    BEGIN { scissors = ENVIRON["COMMENT"] " ------------------------ >8 ------------------------" }
    $0 == scissors { exit }
    index($0, ENVIRON["COMMENT"]) == 1 { next }
    /^[[:space:]]*$/ { next }
    { print; exit }
')

# An empty message is left to Git, which aborts the commit with a clearer
# error ("Aborting commit due to empty commit message").
if [ -z "$subject" ]; then
    exit 0
fi

case $subject in
'Merge '* | 'Revert "'* | 'fixup! '* | 'squash! '* | 'amend! '*)
    exit 0
    ;;
esac

# The description must start with something other than a space, so that
# `feat:` and `feat: ` are rejected.
pattern="^($types)(\([a-z0-9-]+\))?!?: [^[:space:]]"
if printf '%s\n' "$subject" | grep -Eq "$pattern"; then
    exit 0
fi

cat >&2 <<EOF
The first line of the commit message does not follow Conventional Commits.

  Found:     $subject
  Expected:  <type>(<scope>)!: <description>
             (the scope and the ! for a breaking change are optional)

  Types:     feat, fix, docs, refactor, test, perf, build, ci, chore
  Scope:     lowercase letters, digits and hyphens, such as core or deps

  Examples:  feat(core): add pomodoro state machine (T-1.3)
             fix(service)!: reject protocol version 1
             docs: explain native messaging setup

See CONTRIBUTING.md ("Commits"). Your message is saved in $message_file;
edit and reuse it with:

  git commit -e -F $message_file
EOF
exit 1

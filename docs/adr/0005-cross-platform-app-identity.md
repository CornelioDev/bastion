# 0005 — Apps as cross-platform logical entities

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Blocklists will eventually sync with Android and iOS, where apps are identified differently (package names, opaque tokens).

## Decision

From the MVP on, an app is `{ name, ids: { windows_exe, windows_path, android_package, ios_token } }`. iOS tokens are device-local and never synced.

## Consequences

- No data migration when mobile arrives.
- Slightly more complex model and UI for the Windows-only MVP.

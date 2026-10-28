# 0001 — Privileged service as the single source of truth

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A desktop app cannot stop the user from closing or killing it, so any blocking logic that lives in the UI can be bypassed in seconds.

## Decision

All session and blocking logic lives in a Windows service running as `LocalSystem`. The UI and the browser extension are untrusted clients that send requests over IPC; the service decides.

## Alternatives considered

- **Logic in the Tauri app** — trivially bypassed by ending the process.
- **Kernel driver** — strongest guarantees, but requires EV signing and kernel expertise, and greatly raises the security stakes of the project.

## Consequences

- Requires an IPC protocol, an installer that registers the service, and a `--console` mode for development.
- The service becomes a privilege boundary; see `docs/threat-model.md`.

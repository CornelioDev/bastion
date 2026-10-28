# 0004 — Native messaging bridge for the browser extension

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The extension needs the active blocklist and session state from the service.

## Decision

A small native messaging host (`bastion-nmh.exe`) bridges the extension's stdin/stdout to the service's named pipe.

## Alternatives considered

- **Local WebSocket server** — any local process could connect; needs its own authentication; opens a port.

## Consequences

- No listening ports.
- Native messaging manifests must be registered for Chrome and Edge, and list the published extension IDs.

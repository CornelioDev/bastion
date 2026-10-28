# 0002 — Rust for the core and the service

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The service needs low-level Windows APIs, small binaries without a runtime, and memory safety, since it runs as `SYSTEM`. The domain logic should be reusable on Android and iOS later.

## Decision

Use Rust. `bastion-core` is pure and portable (`#![forbid(unsafe_code)]`); `bastion-service` uses `windows-rs`, with `unsafe` confined to one module.

## Alternatives considered

- **C# / .NET** — excellent Windows service story, but hard to reuse on mobile.
- **Go** — good for services, weaker Win32 and mobile bindings ecosystem.

## Consequences

- Steeper learning curve for some contributors.
- One language across the service, the Tauri backend and the future mobile core (`uniffi`).

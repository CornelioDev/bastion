# 0006 — Dual MIT / Apache-2.0 license and DCO

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Bastion is developed in the open. Contributors need clarity on licensing, and the code should be easy to reuse alongside the Rust ecosystem.

## Decision

- License the project under **MIT OR Apache-2.0**, the Rust ecosystem convention.
- Every source file carries an SPDX header.
- Contributions are accepted under the **Developer Certificate of Origin** (`git commit -s`), not a CLA.
- `cargo-deny` rejects dependencies with incompatible licenses.

## Alternatives considered

- **GPL-3.0** — keeps forks open, but limits reuse of `bastion-core` in other projects.
- **CLA** — more legal flexibility for the maintainer, more friction for contributors.

## Consequences

- Anyone, including commercial projects, may reuse the code with attribution.
- Relicensing later requires agreement from all contributors.

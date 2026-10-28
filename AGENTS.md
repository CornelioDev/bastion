# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository. Human contributors should read [CONTRIBUTING.md](CONTRIBUTING.md); everything here applies to them too.

## Project in one paragraph

Bastion is an open-source Pomodoro timer for Windows that blocks distracting **websites** and **applications** during focus sessions, with a **strict mode** that prevents the session from being stopped early. A privileged Windows service (Rust) is the single source of truth; a desktop UI (Tauri 2 + Vue 3) and a browser extension (Manifest V3) are untrusted clients that talk to it over IPC. See [docs/architecture.md](docs/architecture.md).

## Workflow

Work happens one roadmap task at a time, in the loop defined in **[docs/workflow.md](docs/workflow.md)**: the QA engineer writes acceptance tests first, the developer implements without touching them, CI and an independent security reviewer verify, and the maintainer approves from a plain-language report. Read that document before starting any task.

In short:

1. Find the active phase and next task in [docs/roadmap.md](docs/roadmap.md) → **Current status** (respect `Depends on:`).
2. Never modify acceptance tests (`**/tests/acceptance*`) unless you are the QA engineer.
3. Nothing is done until `just check` passes, QA and security both return PASS, and the maintainer approves.
4. On approval: tick the task, update **Current status**, add a `CHANGELOG.md` entry if user-visible, add an ADR in `docs/adr/` for architectural decisions, squash-merge with a Conventional Commit referencing the task (`feat(core): add pomodoro state machine (T-1.3)`), signed off (`-s`).
5. If blocked, mark the task `[~]`, write the reason in **Current status**, and stop.

Task states: `[ ]` todo · `[~]` in progress / blocked · `[x]` done.

## Repository layout

```
bastion/
├── crates/
│   ├── bastion-core/      # Pure domain logic: model, pomodoro engine, rule matching. No OS deps.
│   ├── bastion-ipc/       # IPC protocol: message types, versioning, framing. No OS deps.
│   ├── bastion-service/   # Windows service: process blocking, persistence, IPC server.
│   └── bastion-nmh/       # Native messaging host: browser extension ⇄ service bridge.
├── apps/desktop/          # Tauri 2 app. `src/` = Vue 3 frontend, `src-tauri/` = Rust IPC client.
├── extension/             # Manifest V3 extension for Chrome and Edge (TypeScript).
├── installer/             # WiX v4 MSI sources.
├── docs/                  # Architecture, roadmap, ADRs, threat model, UI stack.
└── .github/               # CI workflows, issue and PR templates.
```

## Hard rules

- **`bastion-core` and `bastion-ipc` are pure.** No `windows` crate, no `std::process`, no network, no direct system clock. Time comes in through the injectable `Clock` trait. Both crates use `#![forbid(unsafe_code)]`.
- **The UI and the extension are untrusted.** The service validates every incoming message. No client request can shorten, pause, or cancel an active strict session, or edit the blocklist it uses.
- **`unsafe` lives only in `bastion-service/src/sys/`**, one wrapper per Win32 call, each with a `// SAFETY:` comment.
- **No telemetry.** Nothing leaves the user's machine unless a future, opt-in sync feature is explicitly enabled.
- **Don't build UI from scratch.** Check [shadcn-vue](https://www.shadcn-vue.com) first; custom components only for domain-specific pieces listed in [docs/ui-stack.md](docs/ui-stack.md). Generated `components/ui/*` files are only edited for tokens or variants.
- **No hard-coded UI strings.** All user-facing text goes through `vue-i18n` (`en` and `es` from day one).
- **Every new source file** starts with an SPDX header: `// SPDX-License-Identifier: MIT OR Apache-2.0` (or `<!-- … -->` in `.vue`/`.html`).

## Conventions

| Area | Convention |
|---|---|
| Language | English for code, comments, commits, docs. UI is localized. |
| Commits | [Conventional Commits](https://www.conventionalcommits.org) + DCO sign-off |
| Versioning | [SemVer](https://semver.org); changelog per [Keep a Changelog](https://keepachangelog.com) |
| Rust | [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/); `rustfmt`; `clippy` with workspace lints; `thiserror` in libraries, `anyhow` only in binaries; no `unwrap()`/`expect()` outside tests; public items documented (`missing_docs` warns) |
| Vue | [Vue style guide](https://vuejs.org/style-guide/) priority A–B; Composition API with `<script setup lang="ts">`; `PascalCase` single-file components; composables named `useXxx` in `src/composables/` |
| TypeScript | `strict: true`, no `any` without a justifying comment |
| Formatting | `rustfmt`, Prettier (TS/Vue/JSON/MD), `.editorconfig` |
| Tests | Rust: `cargo test` (unit next to code, integration in `tests/`). Frontend: Vitest + Vue Test Utils |
| Accessibility | WCAG 2.2 AA: keyboard reachable, visible focus, labels on all controls |

## Commands

`just check` runs everything below and is the single gate used by agents and CI.

```bash
# Rust
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo deny check                       # licenses, advisories, duplicate deps

# Desktop app (from apps/desktop)
pnpm lint && pnpm typecheck && pnpm test
pnpm tauri dev

# Extension (from extension)
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# Run the service without installing it (development)
cargo run -p bastion-service -- --console
```

`lefthook` runs format and lint checks on commit; CI runs everything on `windows-latest`.

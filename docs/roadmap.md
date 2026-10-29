# Roadmap

## Current status

- **Active phase:** F0 — Foundations
- **Next task:** T-0.4
- **Last updated:** 2026-10-28
- **Notes:** Planning complete. Stack: Rust service + Tauri 2 + Vue 3 + shadcn-vue. Dual-licensed MIT OR Apache-2.0. Every task runs through the loop in `docs/workflow.md`. T-0.1 done (Rust pinned to 1.99.1, MSRV 1.99). T-0.2 done (LF everywhere via `.gitattributes`, anchored ignore rules, forced text diffs for sources). T-0.3 done (`deny.toml`: permissive licenses only, advisories in all dependencies, no duplicates, crates.io only; checks `x86_64-pc-windows-msvc` only, pending maintainer confirmation). Decide before T-0.6: whether to accept the five MPL-2.0 crates Tauri pulls in (per-crate exceptions recommended). Open before F2: ADR on isolating `unsafe` code ([#1](https://github.com/CornelioDev/bastion/issues/1)).

Legend: `[ ]` todo · `[~]` in progress / blocked · `[x]` done. Each phase maps to a GitHub milestone; each task can be mirrored as an issue titled `T-x.y: …`.

---

## MVP scope (Windows)

**In:** pomodoro timer (focus / short break / long break, cycles); blocklists with sites and apps; app blocking by process; site blocking through an extension for Chrome and Edge; strict mode with a time lock; service survives closing the UI and reboots; tray icon; notifications; simple history; English and Spanish UI; signed MSI installer.

**Out (post-MVP):** Firefox extension, network-level blocking (DNS/WFP), recurring schedules, advanced statistics, sync, mobile, auto-update of the service.

MVP phases: **F0 → F6**. Later: **F7 → F9**.

---

## F0 — Foundations

### Repository and community

- [x] **T-0.1** Initialize the Cargo workspace with empty crates `bastion-core`, `bastion-ipc`, `bastion-service`, `bastion-nmh`; set `rust-version` (MSRV), `edition = "2024"`, `license = "MIT OR Apache-2.0"`, and `[workspace.lints]`; add `rust-toolchain.toml`.
  - Acceptance: `cargo build --workspace` and `cargo test --workspace` pass.
- [x] **T-0.2** Add `rustfmt.toml`, `.editorconfig`, `.gitattributes` (LF, `*.rs text eol=lf`), `.gitignore`, and `.vscode/extensions.json` (rust-analyzer, Vue - Official, ESLint, Prettier, Tailwind CSS IntelliSense, EditorConfig).
- [x] **T-0.3** Add `deny.toml` for `cargo-deny`: allowed licenses compatible with MIT/Apache-2.0, advisories, banned duplicates.
- [x] **T-0.4** Configure `lefthook.yml`: pre-commit runs `cargo fmt --check`, Prettier, ESLint on staged files; commit-msg checks Conventional Commits.
- [ ] **T-0.5** GitHub settings: create the labels listed in CONTRIBUTING, milestones F0–F6, branch protection on `main` (CI required, one review, squash merge), private vulnerability reporting, Discussions, and the DCO app. Issue forms, PR template, `CODEOWNERS` and `dependabot.yml` are already in `.github/`.
  - Depends on: T-0.1

### Frontend and extension scaffolding

- [ ] **T-0.6** Create `apps/desktop` from the official Tauri 2 Vue + TypeScript template (pnpm).
  - Acceptance: `pnpm tauri dev` opens an empty window.
- [ ] **T-0.7** Add ESLint (flat config with `eslint-plugin-vue` and `typescript-eslint`), Prettier, `vue-tsc` typecheck, Vitest + Vue Test Utils.
  - Depends on: T-0.6
- [ ] **T-0.8** Add Tailwind CSS v4 and initialize shadcn-vue; install the components listed in `docs/ui-stack.md`.
  - Depends on: T-0.7
  - Acceptance: a dev-only page renders all components in light and dark themes.
- [ ] **T-0.9** Apply the design tokens from `docs/ui-stack.md` to the shadcn-vue theme; bundle Geist fonts locally.
  - Depends on: T-0.8
- [ ] **T-0.10** Set up `vue-i18n` with `en.json` and `es.json`, locale detection from the OS, and a lint rule against raw strings in templates.
  - Depends on: T-0.7
- [ ] **T-0.11** Create `extension/` with a Manifest V3 skeleton in TypeScript (Vite), with ESLint, Prettier and Vitest.

### CI and release

- [ ] **T-0.12** Export the MVP mockup screens to `docs/assets/mockups/` and link them from `docs/ui-stack.md`.
- [ ] **T-0.13** CI (`.github/workflows/ci.yml`, `windows-latest`) running `just check`, plus the jobs from T-0.17 and T-0.18. Required for merging into `main`.
  - Depends on: T-0.16, T-0.17, T-0.18
- [ ] **T-0.14** Release automation with `release-please` (workspace versioning, changelog from Conventional Commits, GitHub Releases).
  - Depends on: T-0.13
- [ ] **T-0.15** Verify the project name is free (crates.io, npm, Chrome Web Store, trademarks) before the first public release; rename if needed.

### Quality and security gates (required by `docs/workflow.md`)

- [ ] **T-0.16** `justfile` with `just check` running every check in one command: fmt, clippy, Rust tests, `cargo deny`, and lint/typecheck/test for the desktop app and the extension. Exits non-zero on any failure.
  - Depends on: T-0.3, T-0.7, T-0.11
  - Acceptance: introducing a failing test, a clippy warning, or a lint error each makes `just check` fail.
- [ ] **T-0.17** Coverage with `cargo-llvm-cov` (Rust) and Vitest coverage (TS); CI fails if line coverage of `bastion-core` and `bastion-ipc` drops below 90 %.
  - Depends on: T-0.16
- [ ] **T-0.18** Static security analysis in CI (CodeQL for Rust and TypeScript where supported, otherwise Semgrep), GitHub secret scanning with push protection, and a check on pull-request branches that acceptance tests (`**/tests/acceptance*`) only change in commits with a `test(` prefix.
  - Depends on: T-0.16

## F1 — Domain core (`bastion-core`, 100 % TDD)

- [ ] **T-1.1** Data model: `Blocklist`, `Target` (`Site` | `App`), cross-platform `AppIdentifiers`, `SitePattern` exceptions.
  - Acceptance: types are `serde`-serializable; JSON round-trip tests.
- [ ] **T-1.2** `Clock` trait (monotonic + wall clock) with a fake implementation for tests.
- [ ] **T-1.3** Pomodoro state machine: `Idle → Focus → ShortBreak | LongBreak → Focus …` with configurable durations and cycles (default 25/5/15, 4 cycles).
  - Depends on: T-1.2
  - Acceptance: tests for every transition, pause (non-strict only), skip break, long-break boundary.
- [ ] **T-1.4** Site rule matcher: domain, subdomain wildcard (`*.reddit.com`), path (`youtube.com/shorts`), exceptions taking precedence; IDN and case normalization.
  - Acceptance: table-driven tests, at least 25 cases, exported as a shared JSON fixture for the extension.
- [ ] **T-1.5** App rule matcher: executable name (case-insensitive) and path; a protected-process list that is never blocked (`explorer.exe`, `csrss.exe`, `winlogon.exe`, the service itself, …).
- [ ] **T-1.6** Strict-mode policy: `LockKind` (`None`, `UntilTimerEnds`, `RandomText { len }`) and `can_stop(&session, now) -> Result<(), LockReason>`.
  - Depends on: T-1.3
  - Acceptance: an active strict session rejects stop, pause, shortening, and edits to its blocklist.
- [ ] **T-1.7** Serializable `EngineState` snapshot, restorable after reboot with correct remaining time.
  - Depends on: T-1.3, T-1.6
- [ ] **T-1.8** Rustdoc for every public item; crate-level docs with a usage example (`cargo doc` builds without warnings).

## F2 — Windows service (`bastion-service`)

- [ ] **T-2.1** Binary with `--console` (development) and service mode (`windows-service`); `tracing` to rotating files in `%ProgramData%\Bastion\logs`.
- [ ] **T-2.2** SQLite persistence with migrations: blocklists, settings, sessions, history, block events.
  - Depends on: T-1.1
- [ ] **T-2.3** Protocol in `bastion-ipc`: versioned requests, responses, events, typed errors; size limits.
  - Acceptance: serialization tests and version-compatibility tests.
  - Also: extend `disallowed-methods` in `clippy.toml` with the panicking methods the framing code could reach and the current list misses: `Vec::split_off`, `String::split_off`, `core::iter::Sum::sum`, `core::iter::Product::product`, plus those of any buffer crate added here (e.g. `bytes`: `split_to`, `split_off`, `advance`, `get_u32*`).
- [ ] **T-2.4** Named-pipe server `\\.\pipe\bastion` with explicit DACL and `PIPE_REJECT_REMOTE_CLIENTS`; multiple clients; event subscriptions.
  - Depends on: T-2.3
- [ ] **T-2.5** Service engine: wires `bastion-core`, applies requests, emits events, persists a snapshot on every transition.
  - Depends on: T-1.7, T-2.2, T-2.4
- [ ] **T-2.6** Process monitor: detects new processes (500 ms polling with `sysinfo` in the MVP), terminates matches during focus, logs each block.
  - Depends on: T-1.5, T-2.5
  - Acceptance: a blocked app closes in under 1 s during a session; nothing is touched outside a session.
- [ ] **T-2.7** Restore after reboot: the service reloads the snapshot and resumes a strict session with correct timing.
  - Depends on: T-2.5
- [ ] **T-2.8** Installed and running apps endpoint for the app picker (Start Menu shortcuts + running processes, with icons where possible).
- [ ] **T-2.9** End-to-end test harness on the Windows CI runner: starts the service in `--console` mode, connects as a client over the pipe, starts a strict session, launches a dummy executable on the blocklist and asserts it is terminated; asserts stop requests are rejected while strict.
  - Depends on: T-2.6

## F3 — Desktop UI (Tauri + Vue)

- [ ] **T-3.1** `src-tauri` IPC client: Tauri commands forward to the pipe, service events are re-emitted to the frontend; TS bindings generated with `tauri-specta`.
  - Depends on: T-2.4
- [ ] **T-3.2** Data layer: `services/ipc.ts`, composables on `@tanstack/vue-query` (`useEngineState`, `useBlocklists`, `useSettings`), Pinia store for UI state; invalidate queries on service events.
- [ ] **T-3.3** App shell: shadcn-vue `Sidebar` (Timer, Blocklists, History, Settings), custom title bar, Vue Router, theme following the OS.
- [ ] **T-3.4** **Timer** page (idle): `TimerRing`, preset select, blocklist select, strict switch, Start.
- [ ] **T-3.5** **Active session** page: remaining time, phase, cycle, `StrictLockBanner`, disabled Stop with explanation, blocks this session.
- [ ] **T-3.6** Strict-session confirmation (`AlertDialog`) with summary and end time.
- [ ] **T-3.7** **Blocklists** page: list of lists; detail with Sites / Apps / Exceptions tabs; add-site form (VeeValidate + Zod, same rules as T-1.4); editing locked while in use by a strict session.
- [ ] **T-3.8** **Add application** dialog: `Command` search over T-2.8 results, plus "Browse for .exe".
- [ ] **T-3.9** **Settings** page: durations, cycles, launch at login, sounds, strict by default, browser/extension status, language, theme.
- [ ] **T-3.10** **History** page: sessions per day (shadcn-vue `Chart`), most-attempted targets.
- [ ] **T-3.11** Tray icon: remaining time in tooltip; menu Open / Stop (disabled when strict) / Quit UI; closing the window hides to tray.
- [ ] **T-3.12** Native notifications (`tauri-plugin-notification`) on phase change and when an app is blocked.
- [ ] **T-3.13** Launch at login (`tauri-plugin-autostart`) and single instance (`tauri-plugin-single-instance`).
- [ ] **T-3.14** Accessibility pass: keyboard-only walkthrough of every screen, focus order, screen-reader labels, contrast check in both themes; automated checks with `axe-core` in component tests.
- [ ] **T-3.15** Desktop end-to-end tests with WebdriverIO and `tauri-driver` on the Windows runner: start a session from the UI, see the active-session screen, confirm Stop is disabled in strict mode.
  - Depends on: T-2.9, T-3.6

## F4 — Website blocking

- [ ] **T-4.1** `bastion-nmh.exe`: stdin/stdout ⇄ named pipe bridge; native messaging manifests for Chrome and Edge; `installer/dev/register-nmh.ps1` for development.
  - Depends on: T-2.4
- [ ] **T-4.2** Extension service worker: connects to the host, receives the active blocklist, applies dynamic `declarativeNetRequest` rules (redirect to block page).
  - Depends on: T-0.11, T-4.1
- [ ] **T-4.3** Path rules and exceptions in the extension, validated against the shared fixture from T-1.4.
- [ ] **T-4.4** Block page: site, remaining time; no skip control in strict mode; localized.
- [ ] **T-4.5** Reload already-open tabs that match when a session starts.
- [ ] **T-4.6** Extension ⇄ service heartbeat: a supported browser without an active extension during a session is treated as a blocked app.
- [ ] **T-4.7** Unsupported browsers are blocked as apps during focus.

## F5 — Strict mode hardening

- [ ] **T-5.1** Browser policies in HKLM applied by the service: `ExtensionInstallForcelist`, `IncognitoModeAvailability` (Chrome), `InPrivateModeAvailability` (Edge).
- [ ] **T-5.2** Service recovery actions (restart on failure) and automatic start.
- [ ] **T-5.3** ACL on `%ProgramData%\Bastion`: write for `SYSTEM` only.
- [ ] **T-5.4** Clock-change resistance: remaining time uses the monotonic clock; integration test.
- [ ] **T-5.5** Uninstall guard: the MSI queries the service and aborts while a strict session is active.
- [ ] **T-5.6** Optional (off by default): block Task Manager and service management tools during strict sessions.
- [ ] **T-5.7** Documented manual bypass test checklist in `docs/strict-mode-tests.md`.
- [ ] **T-5.8** Review the service against `docs/threat-model.md` (privilege boundary section) and record findings.
- [ ] **T-5.9** Fuzzing with `cargo-fuzz` for the IPC parser and the native messaging framing; a short fuzz run in CI on every PR touching `bastion-ipc` or `bastion-nmh`, longer runs nightly.

## F6 — Packaging and distribution

- [ ] **T-6.1** MSI (WiX v4): installs UI, service, NMH; registers the service and native messaging manifests.
- [ ] **T-6.2** Code signing for binaries and MSI (e.g. SignPath Foundation's free program for open-source projects).
- [ ] **T-6.3** Publish the extension to the Chrome Web Store and Edge Add-ons (required for `ExtensionInstallForcelist`).
- [ ] **T-6.4** UI updates with `tauri-plugin-updater`; the service updates through the MSI.
- [ ] **T-6.5** Release workflow: build on tag, sign, attach artifacts, generate build provenance attestations.
- [ ] **T-6.6** Smoke test on clean Windows 10 and Windows 11 VMs using a checklist.
- [ ] **T-6.7** User documentation: install, first session, uninstall, FAQ (including the "administrator can bypass" limitation).
- [ ] **T-6.8** Human security review of `bastion-service`, `bastion-ipc`, `bastion-nmh` and the installer (experienced contributor or paid audit). Required before any stable release; see the release gate in `docs/workflow.md`.

**🎯 MVP milestone:** F0–F6 complete → `v0.1.0-beta.1`. Stable `v0.1.0` after T-6.8.

---

## F7 — Sync (post-MVP, opt-in)

- [ ] **T-7.1** Self-hostable backend (PocketBase or Supabase): `blocklists`, `targets`, `sessions`, `devices`. Write an ADR first.
- [ ] **T-7.2** Accounts and device linking.
- [ ] **T-7.3** Blocklist sync (sites universal; apps by platform identifier).
- [ ] **T-7.4** Shared sessions: starting on one device starts on all (real time).

## F8 — Android (post-MVP)

- [ ] **T-8.1** ADR: Tauri 2 mobile + Kotlin plugins vs native Kotlin app.
- [ ] **T-8.2** Expose `bastion-core` to Kotlin with `uniffi`.
- [ ] **T-8.3** Site blocking with a local `VpnService` (DNS filter).
- [ ] **T-8.4** App blocking with `UsageStatsManager` + overlay.
- [ ] **T-8.5** Strict mode with Device Administrator.

## F9 — iOS (post-MVP)

- [ ] **T-9.1** Request the Family Controls entitlement from Apple.
- [ ] **T-9.2** Integrate `FamilyControls` / `ManagedSettings` / `DeviceActivity`; device-local app selection via `FamilyActivityPicker`.
- [ ] **T-9.3** Sync domains only; shield extension in Swift.

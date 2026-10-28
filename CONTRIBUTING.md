# Contributing to Bastion

Thanks for your interest! This guide covers how to set up the project, how we work, and what we expect from a pull request.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** or **suggest a feature** with the issue forms.
- **Report a strict-mode bypass** with the "Strict mode bypass" form — these are feature limitations, discussed in public.
- **Report a security vulnerability** privately — see [SECURITY.md](SECURITY.md). Never open a public issue for these.
- **Improve translations** in `apps/desktop/src/locales/` and `extension/src/_locales/`.
- **Pick up an issue**: `good first issue` and `help wanted` are good starting points. Comment on the issue before starting so work isn't duplicated.

For larger changes (new features, architectural changes), open an issue first. If it changes the architecture, it will need an [ADR](docs/adr/0000-template.md).

## Development setup

Requirements (Windows 10 or 11):

- [Rust](https://rustup.rs) — the toolchain is pinned in `rust-toolchain.toml`.
- [Node.js](https://nodejs.org) LTS and [pnpm](https://pnpm.io).
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2, MSVC build tools).
- [`just`](https://github.com/casey/just), [`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny) and [`lefthook`](https://github.com/evilmartians/lefthook).

```bash
git clone https://github.com/CornelioDev/bastion.git
cd bastion
lefthook install
pnpm install --dir apps/desktop
pnpm install --dir extension

# Terminal 1: the service, without installing it (an elevated terminal is needed to block processes)
cargo run -p bastion-service -- --console

# Terminal 2: the desktop app
pnpm --dir apps/desktop tauri dev
```

To try the extension, load `extension/dist` as an unpacked extension in Chrome or Edge, then register the development native messaging host with `installer/dev/register-nmh.ps1`.

## How we work

- **Planning** lives in [docs/roadmap.md](docs/roadmap.md). Tasks have IDs (`T-1.3`); phases map to GitHub milestones.
- **Architecture** is described in [docs/architecture.md](docs/architecture.md); decisions are recorded in [docs/adr/](docs/adr/).
- **Conventions** for code, naming and tests are in [AGENTS.md](AGENTS.md#conventions) and apply to humans too.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(core): add pomodoro state machine (T-1.3)
fix(service): restore session after reboot when clock moved back
docs: explain native messaging setup
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`. Scopes: `core`, `ipc`, `service`, `nmh`, `desktop`, `extension`, `installer`, `deps`.

Every commit must be signed off under the [Developer Certificate of Origin](https://developercertificate.org):

```bash
git commit -s -m "feat(core): …"
```

## Pull requests

1. Fork and create a branch from `main` (`feat/blocklist-exceptions`, `fix/pipe-reconnect`).
2. Keep PRs focused: one logical change.
3. Add or update tests. Logic in `bastion-core` and `bastion-ipc` is developed test-first.
4. Run `just check` locally; it runs every check CI runs. Don't modify acceptance tests (`**/tests/acceptance*`) in a feature PR; propose changes to them in a separate `test:` PR.
5. Update docs, the roadmap, and `CHANGELOG.md` (`[Unreleased]`) when relevant.
6. Fill in the PR template. CI must pass and one maintainer review is required.

PRs are squash-merged; the PR title becomes the commit message, so it must follow Conventional Commits.

## Labels

| Label | Meaning |
|---|---|
| `bug`, `enhancement`, `docs` | Issue type |
| `strict-mode` | Bypasses and hardening of strict mode |
| `security` | Used by maintainers only, after private triage |
| `area:core`, `area:service`, `area:desktop`, `area:extension`, `area:installer` | Component |
| `good first issue`, `help wanted` | Contributor-friendly |
| `needs-adr` | Requires an architecture decision before implementation |

## Using AI assistants

AI-assisted contributions are welcome. You are responsible for every line you submit: review it, test it, and make sure you can explain it. Agents should follow [AGENTS.md](AGENTS.md).

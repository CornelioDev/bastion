<div align="center">

# Bastion

**A Pomodoro timer that actually keeps you focused.**
Block distracting websites and apps during focus sessions — and, in strict mode, make sure you can't turn it off until the timer ends.

[![CI](https://github.com/CornelioDev/bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/CornelioDev/bastion/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)

</div>

> **Status:** early development. Nothing is released yet — see the [roadmap](docs/roadmap.md).

## Features (MVP, Windows)

- **Pomodoro timer** with focus, short and long breaks, and configurable cycles.
- **Blocklists** of websites (domains, subdomains, paths) and desktop applications, with exceptions.
- **Strict mode:** once started, the session can't be stopped, paused or shortened — not by closing the app, killing it, rebooting, or changing the clock.
- **Browser extension** for Chrome and Edge; browsers without it are closed during focus.
- **Private by design:** everything stays on your machine. No accounts, no telemetry.
- English and Spanish interface.

Planned: optional sync across devices, Android and iOS apps.

## How it works

A small Windows service holds the timer and enforces the blocklists; the desktop app and the browser extension only talk to it. That's why closing the app doesn't end a session. Read more in [docs/architecture.md](docs/architecture.md).

> **Honest limitation:** a determined administrator can always defeat software on their own machine. Bastion aims to make bypassing more effort than waiting. For stronger guarantees, use a standard (non-admin) Windows account day to day. See the [threat model](docs/threat-model.md).

## Installation

Not available yet. The first release (`v0.1.0`) will ship as a signed `.msi` on the [Releases](https://github.com/CornelioDev/bastion/releases) page.

## Contributing

Contributions are welcome! Start with [CONTRIBUTING.md](CONTRIBUTING.md), look for issues labelled [`good first issue`](https://github.com/CornelioDev/bastion/labels/good%20first%20issue), and please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

Found a way to bypass strict mode? Open an issue. Found a **security vulnerability** (e.g. privilege escalation through the service)? Please report it privately — see [SECURITY.md](SECURITY.md).

## Tech stack

Rust (service and core) · Tauri 2 · Vue 3 · Tailwind CSS · shadcn-vue · Manifest V3 extension · SQLite · WiX

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.

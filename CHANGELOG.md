# Changelog

All notable changes to this project are documented in this file. [release-please](https://github.com/googleapis/release-please) generates it from Conventional Commits when a release is prepared, so don't edit it by hand ([CONTRIBUTING.md](CONTRIBUTING.md#releases)). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Before the first release]

Written by hand before releases were automated. The first release's entry lists part of this work again, by commit.

### Added

- Project plan, architecture, threat model and ADRs 0001–0008.
- Agent-based development workflow with QA, developer and security subagents.
- Desktop app skeleton (Tauri 2 + Vue 3) named Keitora: an empty window with a strict Content Security Policy and no Tauri permissions.
- Desktop app design: the color tokens, a harmonized corner radius scale, and the Geist and Geist Mono fonts bundled with the app.
- Browser extension skeleton (Manifest V3) for Chrome and Edge, named Keitora and localized in English and Spanish. It requests no permissions and doesn't block anything yet.

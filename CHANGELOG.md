# Changelog

All notable changes to this project are documented in this file. [release-please](https://github.com/googleapis/release-please) generates it from Conventional Commits when a release is prepared, so don't edit it by hand ([CONTRIBUTING.md](CONTRIBUTING.md#releases)). This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0-beta.1 (2026-11-04)


### Added

* **core:** add the blocklist data model (T-1.1) ([#22](https://github.com/CornelioDev/keitora/issues/22)) ([859c1fa](https://github.com/CornelioDev/keitora/commit/859c1fa2aae857c22dc791fdf1f54294310741c1))
* **core:** add the clock trait and a fake clock (T-1.2) ([#23](https://github.com/CornelioDev/keitora/issues/23)) ([8aeda02](https://github.com/CornelioDev/keitora/commit/8aeda027f37a024034d1a8d9f4c083ede4fcf9da))
* **desktop:** add Tailwind CSS v4, shadcn-vue and a component gallery (T-0.8) ([105a9f1](https://github.com/CornelioDev/keitora/commit/105a9f1bf1b5a72a0997a9e81b57e58d4a013c0d))
* **desktop:** apply the design tokens and bundle the Geist fonts (T-0.9) ([ac3cba5](https://github.com/CornelioDev/keitora/commit/ac3cba5e707d08bfb2c9ba9a592044d74a9404a7))
* **desktop:** scaffold the Tauri 2 desktop app (T-0.6) ([2ca4091](https://github.com/CornelioDev/keitora/commit/2ca4091bb209e55785da0cc6e3b9fe7a94485ecd))
* **desktop:** set up vue-i18n in English and Spanish (T-0.10) ([5dbf87f](https://github.com/CornelioDev/keitora/commit/5dbf87fa35ff1ac44cd687c84b5264cc26b3d2dc))
* **extension:** add Manifest V3 skeleton with Vite, ESLint, Prettier and Vitest (T-0.11) ([c5f0e4b](https://github.com/CornelioDev/keitora/commit/c5f0e4b1d55dee86256d77883a9d13daeceb5f0e))

## [Before the first release]

Written by hand before releases were automated. The first release's entry lists part of this work again, by commit.

### Added

- Project plan, architecture, threat model and ADRs 0001–0008.
- Agent-based development workflow with QA, developer and security subagents.
- Desktop app skeleton (Tauri 2 + Vue 3) named Keitora: an empty window with a strict Content Security Policy and no Tauri permissions.
- Desktop app design: the color tokens, a harmonized corner radius scale, and the Geist and Geist Mono fonts bundled with the app.
- Browser extension skeleton (Manifest V3) for Chrome and Edge, named Keitora and localized in English and Spanish. It requests no permissions and doesn't block anything yet.

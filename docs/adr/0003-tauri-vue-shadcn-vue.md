# 0003 — Tauri 2, Vue 3 and shadcn-vue for the desktop UI

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The UI should be simple and friendly without building components from scratch, light on resources, and approachable for open-source contributors.

## Decision

Tauri 2 with Vue 3 (Composition API, `<script setup lang="ts">`), Tailwind CSS v4 and shadcn-vue (on Reka UI). Supporting libraries are listed in `docs/ui-stack.md`.

## Alternatives considered

- **React + shadcn/ui** — larger ecosystem, but Vue was preferred by the maintainer and has a gentler learning curve for contributors.
- **Electron** — far heavier, and offers nothing the service architecture needs.
- **Native WinUI** — Windows-only, no path to sharing UI with mobile.

## Consequences

- Small binaries; the same UI can later run on Tauri mobile.
- shadcn-vue components are copied into the repo: we own them, and must update them deliberately.

# 0007 — English as the project language, localized UI

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The maintainer is a Spanish speaker, but the project aims for contributors worldwide.

## Decision

Code, comments, commits, issues and documentation are in English. The UI is localized with `vue-i18n`, shipping English and Spanish from the first release; no user-facing string is hard-coded.

## Consequences

- Wider contributor pool; standard for open source.
- Every UI change touches both locale files; CI checks for missing keys.

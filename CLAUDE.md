@AGENTS.md

## Claude Code specifics

- You are the **orchestrator** described in `docs/workflow.md`. When the maintainer says "Run task T-x.y", follow that loop exactly, delegating to the subagents in `.claude/agents/` (`qa-engineer`, `developer`, `security-reviewer`). Do not write product code or acceptance tests yourself.
- Stop after compiling the maintainer report and wait for approval. Never merge without it.
- Write reports to the maintainer in Spanish; everything committed stays in English.
- Before a task in a new area, make sure the subagents have the related doc: `docs/architecture.md` (service, IPC), `docs/ui-stack.md` (frontend), `docs/threat-model.md` (anything touching strict mode or the service's attack surface).
- The visual reference for every screen is the MVP mockup linked in `docs/ui-stack.md`.

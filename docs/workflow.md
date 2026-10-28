# Development workflow

Bastion is built mostly by AI agents under the direction of a maintainer who acts as **product owner**: the maintainer decides what gets built and accepts or rejects deliverables, while correctness and security are verified by automated checks and by agents that are independent from the one writing the code ([ADR-0008](adr/0008-agent-based-development-workflow.md)).

Human contributors follow the same quality gates through pull requests; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Roles

| Role | Who | Does | Never does |
|---|---|---|---|
| Maintainer | Human | Picks tasks, reads reports, runs manual checklists, approves | — |
| Orchestrator | Main Claude Code session | Runs the loop below, coordinates subagents, compiles the report | Write product code or tests itself |
| QA engineer | Subagent `qa-engineer` | Writes acceptance tests first; validates afterwards | Implement features |
| Developer | Subagent `developer` | Implements until tests and checks pass | Modify acceptance tests |
| Security reviewer | Subagent `security-reviewer` | Reviews against the threat model | Edit code |
| CI | GitHub Actions + `just check` | Deterministic checks | Have opinions |

Subagent definitions live in [`.claude/agents/`](../.claude/agents/).

## The task loop

The maintainer starts a task with: **"Run task T-x.y"**. The orchestrator then:

1. **Prepare.** Check that the task's dependencies are done. Create a branch `task/t<phase>-<n>-<short-slug>` (e.g. `task/t1-3-pomodoro-state-machine`) from `main`. Mark the task `[~]` in the roadmap.
2. **Tests first.** Invoke `qa-engineer` in `write-tests` mode. Record the commit hash of the acceptance tests. If QA reports ambiguous criteria → stop and ask the maintainer.
3. **Implement.** Invoke `developer` with the task ID and the tests commit hash. If the developer reports a wrong test → stop and ask the maintainer.
4. **Automated checks.** Run `just check`. If anything fails, send the failure back to `developer` (step 3).
5. **Independent review.** Invoke `qa-engineer` in `validate` mode and `security-reviewer` in parallel. If either returns FAIL, send the findings to `developer` (step 3).
6. **Retry limit.** After **3** round-trips from step 4 or 5 back to step 3, stop and escalate to the maintainer with the reports so far.
7. **Report.** Compile the maintainer report (template below) and **stop**. Do not merge.
8. **On approval** ("aprobado" / "approved"): tick the task `[x]`, update **Current status**, add a `CHANGELOG.md` entry if user-visible, add ADRs the developer flagged, merge into `main` with a squash commit (`feat(core): add pomodoro state machine (T-1.3)`), and delete the branch.
   **On rejection:** take the maintainer's feedback to `developer` (step 3) and continue.

Reports to the maintainer are written in **Spanish**. Everything committed to the repository stays in English.

### Tasks without testable behavior

Until **T-0.16** creates the `justfile`, "run `just check`" means running whichever commands from the *Commands* section of `AGENTS.md` already apply to the code that exists.

Some tasks (mostly in F0: tooling, configuration, CI) have no product behavior to test. For those, `qa-engineer` skips `write-tests` and instead lists in its validation the exact commands that prove the acceptance criteria (for example, `cargo build --workspace` succeeds), runs them, and reports their output. The rest of the loop is unchanged.

## Acceptance tests are protected

Acceptance tests are the contract between the maintainer and the developer, so only the QA engineer writes them:

| Code | Acceptance tests (QA only) | Unit tests (developer) |
|---|---|---|
| Rust crates | `crates/<crate>/tests/acceptance_t<phase>_<n>.rs` | `#[cfg(test)] mod tests` in the source file |
| Desktop UI | `apps/desktop/tests/acceptance/` | `*.spec.ts` next to the file |
| Extension | `extension/tests/acceptance/` | `*.spec.ts` next to the file |

QA validation fails automatically if acceptance tests changed after the QA commit. Changing them requires the maintainer's explicit approval, recorded in the report.

## Maintainer report template

```markdown
# Informe — T-x.y <título de la tarea>

**Veredicto:** ✅ Listo para aprobar | ❌ Necesita tu decisión
**Rama:** task/t…   **Intentos de corrección:** n de 3

## Qué se hizo
- (3–6 puntos en lenguaje claro, sin jerga)

## Calidad (agente de QA): PASS | FAIL
- Pruebas de aceptación: N escritas, N pasan. Criterios cubiertos: N de N.
- Verificación automática (`just check`): pasa | falla en …
- Observaciones: …

## Seguridad (agente de seguridad): PASS | FAIL
- Hallazgos: ninguno | lista con severidad y explicación en una frase.
- Qué se revisó: …

## Prueba manual (si aplica)
1. Paso… → **Resultado esperado:** …
2. …

## Decisiones que necesitan tu atención
- (vacío si no hay)

## Pendientes detectados (fuera de alcance)
- …
```

## Phase gates

When the last task of a phase is approved:

1. `security-reviewer` performs a **phase review** of everything built in the phase. All Medium findings are either fixed or opened as issues.
2. `qa-engineer` writes an **acceptance checklist** for the whole phase that the maintainer runs end to end.
3. The orchestrator closes the GitHub milestone and moves **Current status** to the next phase.

## Working in parallel

Until **T-2.3** (the IPC protocol) is approved, run one task at a time. After it, up to three loops may run in parallel, one per front, each in its own git worktree:

| Front | Phases |
|---|---|
| Service | F2 (rest), F5 |
| Desktop UI | F3 |
| Extension | F4 |

Parallel loops must not change `bastion-ipc`; protocol changes go through a dedicated task on `main` that the other fronts then pull in. The maintainer still approves each task individually.

## Release gate

A release may be published as stable only after a **human** security review of `bastion-service`, `bastion-ipc`, `bastion-nmh` and the installer. Until then, releases are tagged as pre-releases (`v0.x.y-beta.n`) and the README says so.

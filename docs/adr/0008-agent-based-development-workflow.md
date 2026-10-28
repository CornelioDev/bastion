# 0008 — Agent-based development with independent verification

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The maintainer acts as product owner and does not review Rust code line by line. The project still ships a `LocalSystem` service to other people's machines, so correctness and security cannot depend on code review by the maintainer.

## Decision

- Work is done by AI agents in a fixed loop, described in `docs/workflow.md`.
- **Separation of duties:** a QA agent writes acceptance tests before implementation; a developer agent implements without being allowed to change them; a security agent reviews independently. The agent that writes code never verifies it.
- **Deterministic checks first:** tests, lints, dependency audit, static analysis, fuzzing and end-to-end tests in CI decide pass/fail; agent reviews add judgment on top.
- **The maintainer** accepts each task through a plain-language report and manual checklists.
- **Stable releases** require a human security review of the privileged components; until then, only pre-releases are published.

## Alternatives considered

- **Single agent writing code and tests** — tests tend to confirm what was built rather than what was asked.
- **Maintainer reviews every diff** — not feasible for the maintainer's skill set; would become rubber-stamping.

## Consequences

- More agent runs per task (higher cost and time), in exchange for fewer defects reaching the maintainer.
- Acceptance tests become the specification; vague acceptance criteria in the roadmap directly reduce quality, so criteria must be written carefully.
- Agent reviewers share blind spots with the developer agent; the release gate is the mitigation.

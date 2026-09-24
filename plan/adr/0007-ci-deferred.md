# ADR 0007 — CI is deferred

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.1
- **Decided by**: the product owner

## Question

M0.1 builds "a CI workflow running [the scripts]" (`15` §15.4), and later milestones and `14` §14.7 refer to CI. The plan does not name a CI system, and the repository has no remote yet.

## Options

1. **GitHub Actions** — a workflow file running the gates.
2. **GitLab CI** — the same steps in `.gitlab-ci.yml`.
3. **No CI for now** — the gates run locally.

## Decision

No CI workflow is written for now. The gates (`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm bench:check`) run locally, and every check the plan places "in CI" (the permission probe of M0.5, sandboxed testkit runs, the TypeDoc check, benchmark regressions, catalog checks) runs as part of those local gates. When the product owner chooses a CI system, a new ADR adds the workflow; the gate scripts stay the same.

## Consequences

- M0.1 in `15` §15.4 no longer lists the CI workflow, and its *Done when* says the scripts pass on the empty packages (locally).
- `14` §14.7 notes that the frozen-lockfile check and the weekly update job wait for a CI system.

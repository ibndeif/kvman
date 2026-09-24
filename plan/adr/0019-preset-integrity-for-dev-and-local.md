# ADR 0019 — Preset `integrity` is absent for `dev:` and `local:` sources

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner

## Question

`07` §7.3 declared `integrity: string` required on every preset extension entry, while `06` §6.1 says `dev:` and `local:` sources have no integrity (and preview workspaces' applied presets hold `dev:` entries).

## Options

1. **Optional for `dev:`/`local:`** — required for npm, git, and builtin sources, where it must fit the source kind.
2. Always required, with the value `'none'` for `dev:`/`local:`.

## Decision

Option 1: `integrity` is required for `npm:` (`sha512-…`), `git:` (`git:<commit>`), and `builtin:` (`builtin:<kvman version>`) sources and must fit the source's kind; it is absent for `dev:` and `local:` sources.

## Consequences

`07` §7.3 shows `integrity?` with this rule.

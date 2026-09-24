# ADR 0021 — Packages publish publicly

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.1
- **Decided by**: the product owner

## Question

`changeset init` asks whether scoped packages publish publicly or privately. The plan implies public packages (the community SDK, `npm i -g kvman`, `@kvman/example-pdf-translator` in M7.3) but does not say it.

## Decision

`.changeset/config.json` uses `"access": "public"`.

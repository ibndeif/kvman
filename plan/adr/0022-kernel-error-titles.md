# ADR 0022 — Kernel error titles belong to the plan

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

Every Problem has an English `title` (`13` §13.1), but `13` §13.2 gave each kernel code only a "When" column. The implementer wrote the titles in `@kvman/protocol`.

## Decision

The titles become a column of `13` §13.2, and the protocol constants match it exactly (checked by a test).

# ADR 0030 — `protocolVersion` is an integer

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.4
- **Decided by**: the product owner

## Question

The SSE `hello` message and `/schema` carry `protocolVersion`, which the shell compares with its own build to decide whether to run (`12` §12.9), but its type is not specified.

## Options

1. **A positive integer**, compared for equality.
2. A semver string with a compatibility rule.

## Decision

Option 1: `protocolVersion` is a positive integer, `1` in v2, raised on every breaking change to HTTP, the event stream, or the UI contract; the shell runs only when it equals its own. `@kvman/protocol` exports it.

## Consequences

`12` §12.9 states it.

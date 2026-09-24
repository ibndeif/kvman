# ADR 0003 — The pi-ai package

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.5
- **Decided by**: the product owner

## Question

R-Q8 chose pi-ai for the `llm-providers` extension and asked M0.5 to pin the exact npm package and version. Two packages carry it: `@mariozechner/pi-ai`, deprecated on npm with "please use @earendil-works/pi-ai instead going forward", and `@earendil-works/pi-ai`, published by the same maintainers.

## Options

1. **`@earendil-works/pi-ai@0.87.1`** — the maintained package.
2. `@mariozechner/pi-ai@0.73.1` — the deprecated name.

## Decision

`@earendil-works/pi-ai`, pinned at `0.87.1`, a dependency of `extensions/llm-providers` only (added in M4.1). The M7.3 dependency refresh takes the latest version then.

## Consequences

`00` R-Q8 and `10` §10.1 name the package.

## Measurements

npm registry on 2026-09-24: `@earendil-works/pi-ai` 0.87.1, MIT, `engines.node >=22.19.0` (Node 24 satisfies it), repository `github.com/earendil-works/pi`; `@mariozechner/pi-ai` 0.73.1, deprecated.

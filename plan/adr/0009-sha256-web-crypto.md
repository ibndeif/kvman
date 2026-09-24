# ADR 0009 — SHA-256 through Web Crypto, asynchronous

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.2
- **Decided by**: the product owner

## Question

M0.2 puts a SHA-256 digest helper in `@kvman/protocol` (`15` §15.4), but protocol may import only `zod` (`01` §1.5), so `node:crypto` is not available, and the shell uses protocol in the browser.

## Options

1. **Web Crypto, asynchronous** — `globalThis.crypto.subtle.digest`, available in Node 24 and in browsers.
2. **A hand-written synchronous SHA-256** in TypeScript.
3. **No digest in protocol** — each package hashes with its own platform API.

## Decision

Option 1. Protocol's digest helpers return promises and use `globalThis.crypto.subtle`. Canonical JSON itself stays synchronous and is what the plan names: the `JSON.stringify` form with the keys of every object sorted (`05` §5.12).

## Consequences

- `01` §1.5 names the digest form.
- Callers of the digest (idempotency digests at admission, manifest determinism checks) await it.

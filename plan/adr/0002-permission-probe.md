# ADR 0002 — What Node 24's permission model enforces

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.5
- **Decided by**: the product owner (R-Q2); measured by the implementer

## Question

Sandboxed processes (extension hosts, the install-time loader, the builder's test process) rely on Node's permission model plus `--no-experimental-sqlite` (`03` §3.5). R-Q2 asks which powers Node 24 actually denies, and how the kernel detects network enforcement.

## Decision

- Sandboxed processes start with `--permission`, `--allow-fs-read=<exactly the paths they need>`, and `--no-experimental-sqlite`, and no other `--allow-*` flag unless a grant requires it.
- Network is declared and disclosed, not enforced: Node 24 offers no network permission flag. The kernel detects one with `process.allowedNodeEnvironmentFlags.has('--allow-net')` and enforces it automatically when present (R-Q2).
- The probe stays in `packages/kernel/scripts/permission-probe.ts` and runs in `pnpm test` (ADR 0007), failing on every bypass it knows. `kvman doctor` (M7.3) reuses it.

## Consequences

M2.4 builds the sandboxed host with exactly these flags; any Node upgrade that opens a way around them fails the gates.

## Measurements

Node v24.21.0, Linux. The probe starts a child Node with the sandbox flags (read access only to itself and one scratch folder), and the child attempts each operation; a control run without the flags shows each operation succeeds.

| Operation in the sandbox | Result | Without the flags |
|---|---|---|
| read a file outside the granted paths (a stand-in `kvman.db`) | `ERR_ACCESS_DENIED` | read |
| write a file | `ERR_ACCESS_DENIED` | written |
| start a child process | `ERR_ACCESS_DENIED` | started |
| start a worker thread | `ERR_ACCESS_DENIED` | started |
| load a native addon (`process.dlopen`) | `ERR_DLOPEN_DISABLED` | attempted (fails only on the missing file) |
| `import('node:sqlite')` | `ERR_UNKNOWN_BUILTIN_MODULE` | loaded |
| `require('node:sqlite')` | `ERR_UNKNOWN_BUILTIN_MODULE` | loaded |
| `process.getBuiltinModule('node:sqlite')` | `undefined` | loaded |
| network permission flag available | no | — |

Adding `--allow-child-process` alone makes the probe report exactly one bypass (`child-process`).

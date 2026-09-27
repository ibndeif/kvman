# ADR 0141 — The kv shim

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.6
- **Decided by**: the product owner

## Question

`12` §12.6 leaves these open:

- how flag values become payload fields;
- whether `kv` waits for a command's reply;
- where the idempotency key comes from.

It also calls `~/.kvman/bin/kv` a tiny dependency-free Node script that the kernel rewrites at every start, while `01` places the shim in `@kvman/cli`, which the kernel does not depend on. Tests run the kernel from TypeScript sources, which Node runs only from `.ts` files.

## Options

- **Flags:**
  1. **Typed by the input schema, waiting up to 60 s.**
  2. Strings only.
  3. Never waiting.
- **Location:**
  1. **The shim ships in `@kvman/kernel`.**
  2. It stays in `@kvman/cli` and is copied by path.
- **The file:**
  1. **A launcher of the kernel's shim module.**
  2. A full copy of the built JavaScript.

## Decision

Option 1 in each case.

**The file.** At every start the kernel writes `<home>/bin/kv` (0755) with two lines:

- the shebang with `process.execPath`;
- an import of the shim module the running kernel ships (`@kvman/kernel`'s `kv/kv-main`, `.js` when built, `.ts` from sources).

That module uses only Node built-ins.

**Arguments**

- `kv <type> --<field-name> <value> …`: `--field-name` maps to `fieldName`, a top-level property of the input schema. The value is coerced by that property's JSON Schema type:
  - `string` as given;
  - `number` and `integer` parsed;
  - `boolean`: a bare `--flag` is `true`, `--no-flag` is `false`;
  - `array`: the flag repeated, each value coerced by `items`;
  - `object`: JSON text.
- `kv <type> --json -` reads the whole payload from stdin.
- `kv <type> --<field>-file -` reads one field's value from stdin, coerced the same way.
- `--wait <ms>` (default and maximum 60,000) and `--idempotency-key <key>` (else a random UUID per call) are kv's own flags.
- An unknown flag, a missing value, or a value that does not coerce is a usage error.

**Help.** `kv help` lists the allowed types, one per line (`` - `type` (kind): description ``). `kv help <type>` prints the kernel-rendered Markdown: usage, flags, an example, and the output shape. Both come from the socket's `help` op, so nothing the token disallows appears.

**Output and exit codes**

| Case | stdout / stderr | Exit |
|---|---|---|
| Success | `{"ok":true,"data":…}` on stdout | 0 |
| Problem | `{"ok":false,"problem":…}` on stderr | 1 |
| Usage error, or `KVMAN_SOCKET` / `KVMAN_TOKEN` missing | `kv: <message>` on stderr | 2 |

## Consequences

- `01` moves the shim from `@kvman/cli` to `@kvman/kernel`.
- `12` §12.6 gains the flag rules, the waiting, and the launcher.

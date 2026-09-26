# ADR 0126 — Secrets

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

`04` §4.7 keys `secrets.json` by `extension/name`, and `07` §7.5 shows redaction as `••••1234`. The plan does not say:

- what a secret config field's name is, or what a config write carrying one does;
- which names `kernel.secret.set` and `ctx.secrets.set` accept, and the value limits;
- how short secrets are redacted;
- what `ctx.secrets.get` sees after a set in the same handler;
- what boot does when `secrets.json` does not parse.

## Options

- **Secret fields:**
  1. **Dotted path; config writes refuse them.**
  2. Dotted path; config writes move them to secrets.
- **Names:**
  1. **Declared fields for `kernel.secret.*`; free names for `ctx.secrets`.**
  2. Free names everywhere.
- **Redaction:**
  1. **The last 4 characters only for secrets of 12 or more characters.**
  2. Always the last 4.
  3. Never any characters.
- **Reads:**
  1. **The handler's own pending sets.**
  2. Committed values only.
- **A bad file:**
  1. **Refuse to start.**
  2. Start with an empty store.

## Decision

Option 1 in each case.

**Names and values.**

- A config field marked `.meta({ secret: true })` is stored under its dotted path (`apiKey`, `auth.token`).
- `kernel.secret.set` and `kernel.secret.clear` accept only the extension's declared secret field paths. Any other name fails `VALIDATION_FAILED`, listing the declared ones.
- `ctx.secrets.set` and `ctx.secrets.get` accept any name matching `^[A-Za-z0-9._-]{1,128}$`, such as OAuth tokens.
- Values are non-empty strings of at most 64 KB.
- A secret for an extension that is not installed fails `NOT_FOUND`.

**Redaction.** A secret of 12 or more characters reads as `••••` plus its last 4 characters. A shorter one reads as `••••`.

**Reads.** `ctx.secrets.get(name)` returns the handler's own pending set first. A pending clear returns `undefined`.

**The file.**

- `secrets.json` (0600) holds `{ "<extension>/<name>": "<value>" }`.
- Boot step 3 loads it. A missing file is an empty store.
- A file that does not parse, or fails its schema, refuses to start with `INTERNAL`. The message names the file, never its contents, and the file is left untouched.

**Writes.**

- Secret writes are applied after the commit, in commit order: write a new file (0600), fsync it, then rename it over the old one (`04` §4.7). The writes come from `kernel.secret.set` and `kernel.secret.clear`, from `ctx.secrets.set` in a unit of work, and from uninstall with `deleteData`, which removes every `<name>/` key (ADR 0120).
- A failed write keeps the old file and logs the failure: the extension and the secret name, never the value. M2.12 adds the notification.
- The fault point `secrets.after-commit-before-file` sits between the commit and the file write.
- Invariant 10 holds at every crash point. A crash at that fault point loses the committed secret write: the file keeps the old value.

## Consequences

`04` §4.7, `07` §7.5, and `05` §5.8 state these rules.

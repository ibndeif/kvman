# ADR 0147 — Preset import: the token, the refusal codes, and the summary

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

`03` §3.8 makes import preview tokens stateless ("an HMAC … over the previewed content digest"). But `kernel.preset.import { confirmationToken }` must add the previewed JSON to the catalog, and the kernel keeps nothing between the two calls. The plan also leaves open:

- how `kernel.preset.import.preview` reports a preset it must refuse, and with which of `PRESET_INVALID`, `PRESET_UNSHAREABLE`, and `PRESET_SECRET`;
- what its `summary` holds.

## Options

- **Token:**
  1. **The token carries the preset.**
  2. Import sends the JSON again, and the token covers its digest.
  3. The kernel keeps previews in memory.
- **Refusals:**
  1. **The query fails with one code and every issue.**
  2. The query always answers, with a token only when there is no error.
- **Summary:**
  1. **The parts of the apply preview that do not depend on a workspace.**
  2. Identity and replacement only.

## Decision

Option 1 in each case.

**The token**

- The token is `<body>.<signature>`:
  - `body` is the base64url of the canonical JSON of `{ preset, expiresAt }`, with `expiresAt` 10 minutes after the preview;
  - `signature` is an HMAC-SHA256, with the kernel's per-boot key, over `body`.
- `kernel.preset.import` verifies the signature and the expiry, then adds the preset inside the token.
- A forged, changed, expired, or earlier-boot token fails `CONFIRMATION_EXPIRED`.
- The payload stays exactly `{ confirmationToken }`. A large preset makes a large token; payloads over 256 KB spill to blobs as usual.
- Import checks again before it writes:
  - a built-in id fails `PRESET_READONLY`;
  - an id another entry took since the preview is replaced, as the preview said.

**The check** (`07` §7.4), shared by import preview, `kernel.preset.apply.stage { json }`, and save-as:

1. Parse against the preset schema. Every schema issue outside a `source` field is `PRESET_INVALID`. This covers a newer `presetVersion` ("requires a newer kvman"), a missing or ill-fitting `integrity`, and unknown keys such as trust records.
2. **Unshareable**: an issue at `extensions.<name>.source` (a range, tag, branch, bare name, or file path), a `dev:` or `local:` source, and a `digest` are each `PRESET_UNSHAREABLE`.
3. **Secrets**: the secret check of ADR 0017 against the config schemas of the installed extensions gives `PRESET_SECRET` issues.

The query fails with every issue found and one code, the first that applies in the order `PRESET_INVALID`, `PRESET_UNSHAREABLE`, `PRESET_SECRET`. A built-in id fails `PRESET_READONLY`. A preset that passes answers:

`{ summary, issues, confirmationToken }`, where `issues` holds only warnings.

**The summary**

```ts
summary: {
  preset: { id, name, description?, revision },
  replaces: { id, name } | null,          // the catalog entry this import replaces
  extensions: [{ name, source, enabled, grants: Capabilities }],
  pages: string[],                        // ids of the preset's own pages, `preset.<name>`
  config: string[],                       // the extensions its config names
  hidden: { platform: string[], others: number },
}
```

`hidden.platform` lists every hidden id in the platform pack's namespaces (`settings`, `presets`, `extensions`, `inspector`). `others` counts the remaining hidden ids.

## Consequences

- `03` §3.8 (the preview-token paragraph) and `07` §7.4 "Import" state the token, the codes, and the summary.
- `@kvman/protocol` gains the import preview request and result schemas.

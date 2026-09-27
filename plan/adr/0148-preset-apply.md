# ADR 0148 — Preset apply: the preview, grants, stage checks, and events

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

`07` §7.4 lists what the apply preview shows but gives it no shape. It also leaves open:

- **Grants:** what apply grants when an entry's `grants` do not match the version that will run. A preset exported from an older kvman gets the bundled builtin, which may request more or less.
- **Disabled entries:** whether entries with `enabled: false` are staged.
- **Stage checks:** whether stage runs the checks that apply runs.
- **Events:** which events apply publishes besides `kernel.preset.changed`.

## Options

- **Preview:**
  1. **A structured shape.**
  2. One flat list of changes.
- **Grants:**
  1. **Builtins use the bundled manifest; pinned sources must match exactly.**
  2. Always exact.
  3. Always from the manifests.
- **Apply details:**
  1. **Stage every entry; check at stage and again at apply; publish per-extension events.**
  2. Enabled entries only; check at apply only; publish only `kernel.preset.changed` and `kernel.config.changed`.

## Decision

Option 1 in each case.

**The preview** (`kernel.preset.apply.stage` result):

```ts
{
  workspaceId,
  preset: { id, name, revision },
  replaces: { id, name, revision } | null,    // the workspace's applied copy this apply replaces
  catalogReplaces?: { id, name },             // with `json`: the catalog entry its import replaces
  install: [{ name, source, version, digest, isolation,
              capabilities: CapabilityRequest[],            // with their reasons, from the staged manifest
              derived: { subscribes: string[], providesLlm: string[] } }],
  enable: [{ name, version, grants: Capabilities }],
  disable: string[],
  switches: [{ name, from: version, to: version,
               workspaces: [{ workspaceId, name, missing: string[], unexpected: string[] }] }],
  notes: [{ code: 'dependencies-differ' | 'bundled-builtin', name, params }],
  pages: { added: string[], removed: string[] },
  config: [{ extension, fields: string[] }],
  hidden: { platform: string[], others: number },
  confirmationToken, expiresAt,
}
```

- **Text.** Everything is data or keys; the shell renders the words.
- **`install`** lists the versions stage fetched.
- **`enable`** and **`disable`** list the extensions whose enabled state or grants change in this workspace.
- **`switches`** lists each extension whose active version changes, with every other workspace that enables it and its capability diff there. `missing` and `unexpected` are the capability labels of the grant check.
- **`notes`:**
  - `dependencies-differ` goes on every `npm:` or `git:` version stage fetched.
  - `bundled-builtin`, `params { kvmanVersion, version }`, goes on a `builtin:` entry whose integrity names another kvman version.
- **`pages`** compares the preset's own page ids with the applied copy's.
- **`config`** names the top-level fields each written row changes.
- **`hidden`** is split as in the import summary (ADR 0147).

**Grants**

- A `builtin:` entry is granted what the bundled manifest requests and derives. It keeps the preset's isolation when that level is still allowed for it, else it gets the manifest's.
- An `npm:` or `git:` entry is pinned by its integrity, so its `grants` must equal the manifest's exactly. Otherwise stage fails `CAPABILITY_DENIED`, listing `missing` and `unexpected`.
- The one Confirm covers every grant the preview lists, including those of version switches in other workspaces.

**Stage**

- Every entry is staged or found installed, enabled or not, so a later patch or enable can turn it on:
  - a version that is already installed with the same source and integrity is not fetched again;
  - `builtin:` entries always use the bundled version.
- A fetched package that does not match the entry's integrity fails `PRESET_INTEGRITY_MISMATCH`:
  - `npm:`: the registry's `dist.integrity` differs;
  - `git:`: the fetched commit differs from `git:<commit>`.
- Stage then runs every check of apply against the result the preset would give:
  - namespaces;
  - grants;
  - `requireTypes`;
  - config (`CONFIG_INVALID`);
  - a rollback the data does not allow (`EXT_ROLLBACK_BLOCKED`).

  It fails with the same code, so no token is issued for a preset that cannot apply. Apply runs them again.
- The staged trees are held with the token for 10 minutes and dropped when the token expires, is used, or the reply does not commit (ADR 0118).

**Apply**

- Apply follows `07` §7.4 steps 1–7. It runs the checks of stage before step 2. Steps 2 (import) and 3 (installs) commit in one unit, so a failure up to step 3 changes nothing. A failure in steps 5–7 keeps the previous preset; the import and installs of steps 2–3 stay, since each is complete on its own.
- The unit of step 7 writes:
  - the applied copy at the previous revision plus 1 (1 on a first apply), each entry's `digest` set to the local snapshot, without `config`;
  - `workspace_config` rows at their revision plus 1.
- It publishes:
  - `kernel.extension.enabled` or `.disabled` for each extension whose enabled state or grants changed;
  - `kernel.config.changed` for each written row;
  - one `kernel.preset.changed { cause: 'apply' }`.
- Extensions that newly enable run their data migrations and config check before the unit, as enable does (`04` §4.8).
- A redelivered apply whose token died with the kernel fails `CONFIRMATION_EXPIRED`. A version switch it already made stays in place (`07` §7.4).

## Consequences

- `07` §7.4 "Apply" and `03` §3.8 state the shape and the rules.
- `@kvman/protocol` gains the stage request, the preview, and the apply schemas.

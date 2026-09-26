# ADR 0123 — Enable, disable, and grants from applied presets

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.3
- **Decided by**: the product owner

## Question

- ADR 0052 said M2.4 would read grants from the database. Until then, ADR 0114 left the enabled set and the grants as runtime inputs. M2.3 now records both in the applied preset and builds global-scope routing (`06` §6.4).
- M2.4's Build names the grant validity check (`05` §5.7), but M2.3's Done-when needs enable to list missing capabilities.
- `06` §6.4 lists eight enable checks. Some depend on later milestones.
- The plan does not say what happens when an enable or disable changes nothing, or when the extension is quarantined.

## Options

- **Source of grants:**
  1. **M2.3 reads the enabled set and the grants from `workspace_presets`**, and builds the validity check.
  2. The enabled set from presets; grants stay data until M2.4.
- **Enable checks:**
  1. **Every check except those that need a later milestone.**
  2. Only the checks the Done-when names.
- **Edge cases:**
  1. **No-op writes succeed without events.**
  2. Every call writes and publishes.

## Decision

Option 1 in each case.

**Enabled set and grants.**

- From M2.3, the kernel reads each workspace's enabled extensions and their `Capabilities` from its applied preset (`workspace_presets.preset.extensions`, entries with `enabled: true`).
- The `enabled` and `grants` runtime inputs are removed.
- A global-scope invocation (`06` §6.4) uses the intersection of the extension's grants across the workspaces where it is enabled:
  - the `calls` patterns granted in every one of them;
  - the plain capabilities granted in every one of them;
  - the subscriptions granted in every one of them;
  - the most isolated of their isolation levels.
- M2.4 keeps enforcement on every `ctx` surface, the dedicated and sandboxed hosts, and hosts keyed by isolation.

**Grant validity (`05` §5.7), built in M2.3.**

- A grant is valid only when:
  - `requested` equals the manifest's capability requests, as sets, with the same `calls` patterns;
  - `derived.subscribes` and `derived.providesLlm` equal what the manifest derives;
  - `isolation` is `sandboxed`, or the lower level the manifest requested. A `builtin:` extension's isolation must be `shared`.
- Anything else fails `CAPABILITY_DENIED` with `params { missing, unexpected, isolation? }` and one issue per difference.

**Enable checks in M2.3, in this order:**

1. The workspace exists (`WORKSPACE_INVALID`) and has an applied preset (`PRESET_REQUIRED`).
2. The extension is installed (`NOT_FOUND`) and not quarantined (`EXT_QUARANTINED`).
3. Its active snapshot verifies (a mismatch quarantines it with `EXT_INTEGRITY`, as boot step 4 does).
4. No other extension enabled in the workspace has its namespace (`NAMESPACE_CONFLICT`, naming the other extension).
5. The grant is valid (`CAPABILITY_DENIED`).
6. Every type in its `requireTypes` is provided by an extension enabled in the workspace (itself included), or is a `kernel.*` type. A missing one fails `EXT_REQUIRES_MISSING` (`13` §13.2) with `params { types }`, one issue per type.
7. Its stored config values (the `global_config` row and this workspace's row) are valid against its config schema (`CONFIG_INVALID`).

The rest come later: UI references, routes, and `requireComponents` with M2.10; provider conflicts with M2.9; data migrations and the `schema_versions` row with M2.7.

**Enable edge cases.**

- An entry that is not yet in the preset is added with the source and integrity of the active version and its digest.
- An enable whose grants equal the current ones changes nothing: it returns the current revision and publishes nothing.
- Otherwise the entry is written, the revision goes up by one, and the unit publishes `kernel.preset.changed {cause: 'enable'}` and `kernel.extension.enabled`.

**Disable.**

- Disable fails `EXT_IN_USE` with `params { dependents }` while another enabled extension in the workspace requires one of its types.
- Disabling an entry that is absent or already disabled succeeds with the current revision and no events. A workspace with no applied preset has no revision to reply with, so a disable there fails `PRESET_REQUIRED`, as enable does.
- A real disable sets `enabled: false` (keeping the entry and its grants), bumps the revision, and publishes `kernel.preset.changed {cause: 'disable'}` and `kernel.extension.disabled`.
- Quarantine is cleared after any disable, including one that changes nothing, when the extension is then enabled in no workspace (`03` §3.6). The same unit sets `status` to `active`, clears the reason, and publishes `kernel.extension.unquarantined {name}`. Without this, an extension quarantined at enable (step 3), which is enabled nowhere, could never be recovered.

## Consequences

- ADR 0052's "M2.4 implements it over the database" is superseded for the grants source; M2.4 keeps enforcement.
- `15` M2.3's Build names the validity check. M2.4's Build keeps the grant shape and enforcement.
- `06` §6.4 cites this ADR for the checks built in M2.3.

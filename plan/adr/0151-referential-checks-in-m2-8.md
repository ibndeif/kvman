# ADR 0151 — Referential checks of presets in M2.8

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.8
- **Decided by**: the product owner

## Question

`07` §7.4 apply step 5 and `kernel.preset.update` validate the preset "referentially (`06` §6.3)". But UI registrations are recorded only from M2.10, whose Build list names "preset references". ADR 0110 said M2.3 would let `kernel.validate` take `workspaceId`. M2.3 did not, and `kernel.validate` still refuses it.

## Options

1. **Non-UI checks now, UI checks in M2.10**, with `kernel.validate { workspaceId }` answering the non-UI checks.
2. The same, plus `app.home` and nav items against the preset's own pages now.
3. The non-UI checks in apply and update, with `kernel.validate` still refusing `workspaceId`.

## Decision

Option 1.

**What M2.8 checks against the resulting enabled set**, at apply stage, apply, and update:

- namespaces (`NAMESPACE_CONFLICT`);
- grants (`CAPABILITY_DENIED`);
- `requireTypes` (`EXT_REQUIRES_MISSING`);
- stored config against each schema (`CONFIG_INVALID`).

**`kernel.validate { workspaceId, preset | manifest }`** now answers:

- the structural checks;
- the same checks against the workspace, reported as issues. A preset replaces the workspace's enabled set; a manifest is added to it.

An unknown workspace fails `WORKSPACE_INVALID`. `catalog` stays refused until M2.11.

**What M2.10 adds** with UI recording:

- `hidden`, `labels`, and `layout.order` checked against contribution ids;
- nav items against pages;
- `app.home` against the routes of active pages (`PRESET_REFERENCE_MISSING`);
- routes (`ROUTE_CONFLICT`).

## Consequences

- ADR 0110's note that M2.3 adds `workspaceId` is corrected by this ADR.
- `03` §3.8's `kernel.validate` row and `15` M2.8 and M2.10 say which checks each milestone builds.

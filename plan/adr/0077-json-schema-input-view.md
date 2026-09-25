# ADR 0077 — Inputs are recorded in Zod's input view

- **Status**: accepted
- **Date**: 2026-09-25
- **Milestone**: M1.6
- **Decided by**: the product owner

## Question

ADR 0047 converts every schema with `z.toJSONSchema`'s default options, the output view. A field with `.default()` is then required in the manifest's JSON Schema, so admission (`03` §3.3 step 5) refuses a payload that omits it, although the host's Zod parse (ADR 0074) would fill in the default.

## Options

1. **Input view for inputs**: what senders send (a command's or query's `input`, an event's `payload`) is converted with `io: 'input'`; everything else keeps the output view.
2. Keep the output view everywhere; `.default()` has no effect at admission.

## Decision

Option 1. `toJsonSchemaDocument(schema, view)` takes `'input'` or `'output'`. The recorder converts command and query `input` and event `payload` with `'input'`, and outputs, collections, entities, log entries, and config with `'output'`. Defaulted fields are optional at admission and filled in by the host.

The manifest records exactly Zod's input view, so a plain `z.object` input also accepts unknown fields at admission and the host's parse strips them; an author who wants them refused writes `z.strictObject`. (Asked separately; the product owner chose to follow Zod rather than keep inputs closed through a conversion hook.)

## Consequences

ADR 0047 is amended; `05` §5.12 says which view each schema is recorded in; the M0.3 pdf fixture's inputs and event payloads are regenerated.

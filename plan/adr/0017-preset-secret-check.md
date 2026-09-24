# ADR 0017 — Detecting secrets in a preset's config

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M0.3
- **Decided by**: the product owner

## Question

M0.3's *Done when* asks for "a secret in config" to fail with the right path, and `07` §7.4 rejects presets that contain secrets (`PRESET_SECRET`). A preset alone cannot tell which fields are secret: that is marked in each extension's config schema (`.meta({ secret: true })`, `05` §5.8).

## Options

1. **Preset config checked against config schemas** — a pure validator takes the preset and its extensions' config JSON Schemas.
2. A manifest whose secret field has a default value fails.
3. Both.

## Decision

Option 1. `@kvman/protocol` exports a pure check that takes a preset and the config JSON Schemas of its extensions (by extension name) and reports every value at `config.<extension>.<field>` whose field is marked `secret` (nested object fields included), as `PRESET_SECRET` issues with that path. Config for an extension whose schema is not given is reported too (fail closed, confirmed by the product owner): a secret cannot be ruled out, so callers supply every schema. Import and apply use it once the manifests are known (M2.8).

## Consequences

`07` §7.4 names the check.

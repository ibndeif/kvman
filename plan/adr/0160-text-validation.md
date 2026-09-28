# ADR 0160 — Text validation: the ICU library, keys, literals, and presets

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.11
- **Decided by**: the product owner

## Question

`06` §6.3 and `08` §8.16 list the text checks (keys exist, ICU is valid, parameters are passed, literal text warns, other catalogs warn). The plan leaves open:

- **Library.** The kernel parses ICU for validation and formats it for `ctx.i18n.t`, which is synchronous and runs in hosts, including sandboxed ones. D55 names `intl-messageformat` for the shell only.
- **Warnings.** M2.11's Build line names ICU, keys, and parameters; no milestone builds the literal-text warning or the warning for a key missing from a non-default catalog.
- **Presets.** Whether a preset's own catalogs and keys get the same checks, and with which code.
- **Literal presets.** `07` §7.3 lets a preset's `app.title` and labels be literals.
- **Settings sections.** `registerSettingsSection` replaces the form `registerConfig` generates, but nothing refuses it without `registerConfig`, and the registry's section needs a config schema.
- **`kernel.validate { catalog }`.** ADR 0110 deferred it to M2.11 without saying what `catalog` is.

## Options

- **Library:**
  1. **`intl-messageformat` in the kernel; hosts may read it.**
  2. An asynchronous `ctx.i18n.t` formatted by the kernel.
  3. The kernel's own ICU code.
- **Warnings:**
  1. **Now.**
  2. With the builder.
- **Presets:**
  1. **The same checks, `PRESET_INVALID`.**
  2. The same checks, `VALIDATION_FAILED`.
  3. Not now.
- **Literal presets:**
  1. **Extensions only.**
  2. Presets too.
- **Settings sections:**
  1. **Refused without `registerConfig`.**
  2. Listed without config.
- **`catalog`:**
  1. **One language's catalog.**
  2. A whole `Translations` value.

## Decision

Option 1 in each case.

**Library**

- The kernel depends on `intl-messageformat` 12.1.2 and imports its parser `@formatjs/icu-messageformat-parser` 3.5.20 (the version it uses) for the syntax tree.
- The install loader and sandboxed hosts may also read these packages and their dependencies (`@formatjs/fast-memoize`, `@formatjs/icu-skeleton-parser`), read-only, next to the kernel, SDK, protocol, and Zod (ADR 0129). For each of these four packages, both its real folder and the path it is imported through (the pnpm symlink beside the package that depends on it) are allowed, because the permission model checks the import path. Nothing else is added. `--permission` and `--no-experimental-sqlite` are unchanged.
- Messages are parsed with tags ignored: output is always plain text (`08` §8.16), so `<b>` is literal text.

**Rules** (for an extension, in its manifest; they read only that manifest, so they run at recording and in `kernel.validate { manifest }`, `EXT_MANIFEST_INVALID`):

1. `translations.default` names a shipped catalog (error).
2. Every catalog message parses as ICU (error at its catalog path).
3. A **key use** is a string that is exactly `$t.<key>`, a `{{ $t.<key> }}` inside a string, or an object with a string `$t` (its other keys are the parameters), anywhere in the manifest except `translations`. Each key exists as a message in the default catalog (error), and in every other shipped catalog (warning).
4. Every argument a message uses (in any shipped catalog) is passed by each use of its key (error). `$t.<key>` and `{{ $t.<key> }}` pass none.
5. A **literal** is a user-facing `Text` string that is not a binding or key and still has a letter after its `{{ }}` parts are removed. Each is a warning. User-facing `Text` is:
   - `meta.title` and `summary`, capability, isolation, `requireTypes`, and `requireComponents` reasons, entity `title` and `display`;
   - schema `.meta` `label`, `help`, and `ui.group`;
   - the `Text` fields of each contribution and action shape (`08` §8.5, §8.7);
   - props of built-in components that their spec marks as text (format `kvman-text`, as `z.text()` marks composite and widget props), and composite and widget props marked the same.
6. `registerSettingsSection` without `registerConfig` fails, with the hint to register the config.

**`kernel.validate { catalog }`** takes one language's `Catalog` (the content of a `locales/<lang>.json` file). It checks the catalog's shape (nested objects, string leaves, keys without dots) and rule 2, with issues at `catalog.<key>`; nothing names which keys are used, so with `workspaceId` nothing more is checked.

**Presets** get rules 1–4 over the preset except `translations`, `extensions`, `config`, and `llm`, with keys looked up in the preset's own catalogs, and a failure is `PRESET_INVALID` with every issue. They run wherever a preset is read: import preview and import, apply stage with JSON, save-as, update, `kernel.validate { preset }`, and built-in presets (when packed and when seeded). Presets get no literal warning.

## Consequences

- `@kvman/protocol`'s built-in component specs mark their `Text` props with the `kvman-text` format (a changeset).
- ADR 0129 gains a note: the read roots include the ICU packages.
- `06` §6.3, `07` §7.3–§7.4, `08` §8.16, `05` §5.3 (`registerSettingsSection`), and `03` §3.8's `kernel.validate` row are corrected.
- The literal warning becomes an error for builder-generated extensions later (`11`); the rule here is the one it uses.

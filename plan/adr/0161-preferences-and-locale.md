# ADR 0161 — User preferences, the message locale, and `ctx.i18n.t`

- **Status**: accepted
- **Date**: 2026-09-28
- **Milestone**: M2.11
- **Decided by**: the product owner

## Question

`08` §8.16 and `03` §3.8 define `kernel.user.preferences.get` and `.set` and the `locale` a handler sees, but leave open:

- **Preferences.** The values before anything is saved, whether a `set` that changes nothing publishes `kernel.user.preferences.changed`, and how a tag is stored.
- **`ctx.i18n.t`.** What happens when the key is in no catalog on the fallback chain, or a parameter the message uses is missing.
- **Arabic digits.** `08` §8.16's picker saves `ar` for Arabic-Indic digits and `ar-u-nu-latn` for Western ones, but the Unicode data Node 24 and browsers use (CLDR 48) formats plain `ar` with Western digits.
- **Schedules.** The kernel admits a schedule's next run when schedules are reconciled, before it fires; which saved locale does that run carry?

## Options

- **Preferences:**
  1. **Defaults, an event only on a change, the canonical tag.**
  2. The same, with an event on every set.
- **`ctx.i18n.t`:**
  1. **Throw `VALIDATION_FAILED`.**
  2. Never throw; answer `⟨ns:key⟩`, like the shell.
- **Arabic digits:**
  1. **Explicit tags for both choices.**
  2. `ar` means the CLDR default.
  3. `ar` forced to Arabic-Indic when formatting.
- **Schedules:**
  1. **The locale at admission.**
  2. The locale when the run fires.

## Decision

Option 1 in each case.

**Preferences**

- One row in `user_preferences` for the one local user (`user_id` `local`, the id in `user:local`).
- Before any set, `get` answers `{ locale: 'en', theme: 'app', desktopAlerts: false }` (`08` §8.16: `en`, `app`; desktop alerts are opt-in).
- `set { locale?, theme?, desktopAlerts? }` (`access: 'user'`) validates the locale with `Intl.getCanonicalLocales` and stores its canonical form (`en-us` → `en-US`); the canonical tag must be a language tag of `localeSchema` of at most 64 characters, because every message context carries it. Anything else fails `VALIDATION_FAILED`.
- A set writes the row and publishes `kernel.user.preferences.changed { locale, theme, desktopAlerts }` (global, durable) only when a value changed; otherwise it succeeds with no write and no event (as disable's no-op, ADR 0123). It answers `{}`.

**Locale in messages**

- At admission, a message whose cause carries no `locale` gets the saved one (`02` §2.10); it is inherited unchanged down the chain, so a change applies to new correlations only.
- The kernel keeps the saved locale in memory, read at boot and replaced after each committed set.
- A schedule's run is admitted when schedules are reconciled (ADR 0144) and carries the locale saved then; contexts never change after admission, so a language change reaches the runs admitted after it.

**Arabic digits**

- The picker saves `ar-u-nu-arab` (Arabic-Indic digits) and `ar-u-nu-latn` (Western digits). Each tag names its digits whatever CLDR's default for `ar` is; catalogs are found under `ar` through the base-language fallback.

**`ctx.locale` and `ctx.i18n.t`**

- `ctx.locale` is the message's `context.locale`.
- `ctx.i18n.t(key, params?)` looks the key up in the extension's own catalogs: the exact tag, its base language, then the default locale. It formats with `intl-messageformat` in `ctx.locale`, tags ignored, and returns a string.
- A key found in none of them, a parameter the message uses and `params` lacks, or a parameter that is not a string, number, boolean, or null throws `VALIDATION_FAILED` naming the key and the parameter, like other misuse of `ctx`.

## Consequences

- `@kvman/protocol` gains the preference schemas and the event payload; `@kvman/sdk`'s `Ctx` gains `locale` and `i18n` (changesets).
- The kernel runtime no longer takes a `defaultLocale` option.
- `08` §8.16 and `05` §5.4 say what `ctx.i18n.t` throws, and `08` §8.16's picker saves `ar-u-nu-arab`; `03` §3.8's preference rows point here.

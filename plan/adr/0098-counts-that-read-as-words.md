# ADR 0098 — counts that read as words: plural forms, and a fold that says what it did

Status: accepted by the product owner on 2026-10-20 (the recommended option of both questions). It amends plan 02
§2.11, plan 06 §6.1, plan 08 §8.7, ADR 0093, 1 (the fold's words), ADR 0090, 6 and ADR 0013, 10 (counts after a
colon), and ADR 0009, 109 (status texts have no plural forms).

## Context

The owner showed a fold that read `Changed 1 · Ran 1 · Failed 1` and called `Read 1 · Changed 1` ridiculous, asking for
the same care everywhere. kvwebui's `t` had no plural forms, so every count was written as `Word N` or `Word: N` to
avoid "1 files", and many still read wrongly at one: "1 files", "Show 1 earlier messages", "1 providers", "the 1
workspaces", "1 steps of the execution map are not done". vue-i18n already chooses a plural form from a numeric `count`
param, but its default rule knows only English-like forms, and Arabic has six.

## Decisions

1. **Catalog texts may hold plural forms** (asked; recommended: real plural forms over labels).
   - A catalog string may hold plural forms separated by `|` (vue-i18n's syntax), one for each plural category its
     language has, in the order zero, one, two, few, many, other (`Intl.PluralRules`): English `one | other`, Arabic all
     six. A string without `|` is one text for every count.
   - kvwebui picks the form from the `count` param when it is a number: in `t`, `kvman.t`, a toast's params, and, in a
     view's, button's, status item's, or confirmation's text, a `count` that resolves to a number before it is
     formatted. A text whose number of forms isn't its language's number of categories gets vue-i18n's default choice;
     a text with forms and no numeric `count` shows its last form.
   - Every count kvman passes to a text is a number. A count may still follow a label where a label reads best
     (`Pending changes: 2`), but never forces a wrong plural.
2. **A fold says what it did as a short sentence** (asked; recommended: a sentence with real nouns).
   - The words are, in this order and each only when above 0: `read N files` (the distinct paths of `fs read` and `fs
     read-files`), `ran N searches` (`fs search`, `find`, and `list` calls), `changed N files` (the distinct paths of
     `fs write`, `edit`, `undo`, `assemble`, and `part`), `ran N commands` (shell and binary lines), and `used N other
     tools` (every other call), joined by the catalog's `{first}, {next}` and with the first letter in capitals for the
     page's language: `Read 3 files, changed 1 file, ran 1 command`. In Arabic: `قراءة 3 ملفات، تعديل ملف واحد، تشغيل
     أمر واحد`.
   - Failures follow as ` · N failed` (Arabic `فشلت خطوة واحدة`) in the danger color; what counts as a failure is
     unchanged (ADR 0093, 1).
   - The words start at the row's inline start, after the chevron.
   - `fs read-files` (ADR 0097, 2) now counts as a read; it was counted as another tool.
3. **The count texts are rewritten with plural forms.**
   - kvwebui: the confirmation to delete missing workspaces, and the Extensions page's intro.
   - kvai: the connected, all, and per-provider model counts, the provider search's placeholder, and the model
     picker's `{shown} of {count} models` (its param `total` becomes `count`).
   - kvcoder: the header's turn count (`4 turns · 1.5K tokens used`), the approval card's question (`Allow this
     command?`, `Allow these 3 commands?`), the earlier messages' buttons, the map's steps left, an MCP server's tool
     count, and the call cards' files, entries, matches, tools, runs, bytes, and replacements. A search's outcome is
     `{matches} in {files}`, each part its own plural text (`12 matches in 3 files`, `The first 100 matches in 9
     files`).
   - The Arabic notification offer no longer puts و right before `kvman` (ADR 0013, 10): "…عندما تحتاجك محادثة بينما
     kvman في الخلفية".
   - The catalog tests compare the placeholder names each language uses, since plural forms repeat them and a form
     may leave the count out.

## Consequences

- A count reads right at 1, 2, and many, in English and Arabic.
- An extension's catalog can use plural forms with nothing else to learn: `"notes.count": "{count} note | {count}
  notes"` and `kvman.t('notes.count', { count })`.
- A plural text shown by a tool that doesn't pick forms (none in kvman) would show its `|`; kvman's catalogs are read
  only by kvwebui.

# QA 66 — counts that read as words (ADR 0098)

**Asked.** The owner showed a fold that read `Changed 1 · Ran 1 · Failed 1`, called `Read 1 · Changed 1` ridiculous,
and asked for the same care in every place. They chose the recommended option of both questions: real plural forms in
the catalogs, and a fold that reads as a short sentence (ADR 0098).

Paths are relative to the repository root.

## Happy path

- **QA66-H1 English plural forms.** *Given* the text `{count} file | {count} files`, *when* kvwebui translates it with
  `count` 0, 1, and 3, *then* it shows `0 files`, `1 file`, and `3 files`. `extensions/kvwebui/test/web/plural-forms.test.ts`
- **QA66-H2 Arabic's six forms.** *Given* an Arabic text with six forms, *when* it is translated with `count` 0, 1, 2,
  3, 11, and 100, *then* each shows its own form (zero, one, two, few, many, other).
  `extensions/kvwebui/test/web/plural-forms.test.ts`
- **QA66-H3 a contributed text chooses its form.** *Given* a status item whose `count` param is a query's output with
  `format: 'compact'`, and a view text whose `count` is a number, *when* they show 1 and 1500, *then* they read
  `1 note` and `1.5K notes`. `extensions/kvwebui/test/web/plural-forms.test.ts`
- **QA66-H4 a fold reads as a sentence.** *Given* two reads, a search, and a shell line in a row, *then* the fold reads
  `Read 2 files, ran 1 search, ran 1 command`. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA66-H5 files are counted once.** *Given* an `fs read-files` of `a.ts` and `b.ts`, an `fs read` of `a.ts`, and two
  `fs edit` calls on `a.ts`, *then* the fold reads `Read 2 files, changed 1 file`.
  `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA66-H6 failures follow, in the danger color.** *Given* a fold with an edit and a failed shell line, *then* its
  words read `Changed 1 file, ran 1 command`, a separate part reads ` · 1 failed` with the class `kvc-fold-failed`, and
  the words sit in `kvc-fold-words`, which starts at the inline start. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA66-H7 an Arabic fold.** *Given* the same fold in Arabic, *then* it reads `قراءة ملفين، بحث مرة واحدة، تشغيل أمر
  واحد`. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA66-H8 kvcoder's counts read right at one.** *Then* a listing of one entry reads `1 entry`, a found file `1 file`,
  a search of one match in one file `1 match in 1 file`, a size of one byte `1 byte`, the approval card for one
  command asks `Allow this command?` and for three `Allow these 3 commands?` (`extensions/kvcoder/test/web/count-texts.test.ts`);
  an edit says `1 replacement · from line 82` (`extensions/kvcoder/test/web/call-views.test.ts`); and the header's
  hint starts `1 turn ·` (`extensions/kvcoder/test/web/context-line.test.ts`).
- **QA66-H9 kvai's counts read right at one.** *Then* one connected provider reads `1 provider`, a provider with one
  model `1 model`, and the model picker with one model `1 of 1 model`.
  `extensions/kvai/test/web/count-texts.test.ts`
- **QA66-H10 kvwebui's counts read right at one.** *Then* the Extensions page with one extension says `What's running
  in kvman: 1 extension, from the … preset. Open it to configure it.`, and the confirmation for one missing workspace
  asks `Delete the data of the workspace whose folder is missing?`. `extensions/kvwebui/test/web/plural-forms.test.ts`

## Edge cases

- **QA66-E1 a text with the wrong number of forms.** *Given* an Arabic text with two forms, *when* it is translated
  with `count` 1 and 2, *then* it gets vue-i18n's default choice (the first form for 1, the second otherwise).
  `extensions/kvwebui/test/web/plural-forms.test.ts`
- **QA66-E2 no numeric count.** *Given* a text with forms, *when* it is translated with no `count` or a `count` that is
  text, *then* it shows its last form. `extensions/kvwebui/test/web/plural-forms.test.ts`
- **QA66-E3 every catalog's forms match its language.** *Then* each text with `|` in a catalog of the kernel, kvai,
  kvwebui, kvcoder, and kvbuilder has one form per plural category of its language, and the desktop app's catalogs,
  which aren't read by kvwebui, hold none. `test/tooling/plural-forms.test.ts`
- **QA66-E4 a fold of failures only.** *Given* two failed shell lines and an `fs edit` the agent sent invalid, *then*
  the fold reads `Changed 1 file, ran 2 commands` and ` · 2 failed`. `extensions/kvcoder/test/web/call-folds.test.ts`
- **QA66-E5 a cut search.** *Given* a search cut at 100 matches in 9 files, *then* it reads `The first 100 matches in 9
  files`, and in Arabic `أول 100 نتيجة في 9 ملفات`. `extensions/kvcoder/test/web/count-texts.test.ts`

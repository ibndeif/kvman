---
'@kvman/sdk': patch
'@kvman/testkit': patch
'@kvman/kvwebui': patch
'@kvman/kvai': patch
'@kvman/kvcoder': patch
---

Counts that read as words (ADR 0098). A catalog text may hold plural forms separated by `|`, one per plural category of its language (English two, Arabic six), and kvwebui chooses one by a numeric `count` param, in `kvman.t`, toasts, and contributed views and status items. kvman's own count texts use them: `1 file`, `Show 1 earlier message`, `1 provider`, `Allow this command?`, `1 turn`. A fold of calls reads as a sentence, `Read 3 files, changed 1 file, ran 1 command · 1 failed`, with each file counted once, `fs read-files` counted as a read, the failures in the danger color, and the words at the row's start. The testkit's i18n guide explains plural forms.

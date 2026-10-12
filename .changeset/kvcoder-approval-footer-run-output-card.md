---
'@kvman/kvcoder': patch
---

An approval's Deny and Allow are now a row under its call, and a button of an actions row keeps its label on one line, so a long command no longer squeezes them to a letter a line. A `background output` card reads as the run it read: closed, its line ends with the run's status; opened, it shows the run's description, a status chip with a non-zero exit code, how long the run took once it has ended, then its problem and its output (a subagent's answer as Markdown), in place of the raw `id`, `kind`, `status`, and `startedAt` rows (ADR 0062).

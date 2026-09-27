# ADR 0144 — Declared schedules

- **Status**: accepted
- **Date**: 2026-09-27
- **Milestone**: M2.7
- **Decided by**: the product owner

## Question

`05` §5.3 and `03` §3.4 say a declared schedule "sends one of its own commands" and is "materialized as timer messages by the kernel". ADR 0016 left the cron syntax for M2.7. The plan does not say:

- which workspace a run is in;
- when the next run is created, which settles missed runs and overlap;
- how runs follow disable, quarantine, and reload;
- where the schedule state lives;
- when the command and payload are checked.

## Options

- **Workspace:**
  1. **Each workspace where the extension is enabled; once without a workspace for a global command.**
  2. Only global commands.
  3. A `scope` field on the schedule.
- **Cron:**
  1. **5 fields, in local time.**
  2. 5 fields, in UTC.
  3. 6 fields with seconds.
- **Next run:**
  1. **One outstanding run, with missed runs caught up once.**
  2. Created when the current run fires.
  3. Missed runs skipped.
- **Lifecycle:**
  1. **Runs follow the schedule set.**
  2. Left pending.
- **Storage:**
  1. **A `schedules` table.**
  2. A column on `messages`.
- **Checks:**
  1. **At validation.**
  2. Own command only.

## Decision

Option 1 in each case.

**Targets**

- A schedule whose command has workspace scope has one run per workspace where the extension is enabled.
- A schedule whose command is registered with `scope: 'global'` has one run without a workspace, while the extension is enabled in at least one workspace.

**Syntax**

- `every` is a duration (ADR 0016).
- `cron` has five fields: `minute hour day-of-month month day-of-week`.
  - Allowed: `*`, lists, ranges, steps (`*/15`, `1-5/2`), month and day names (`jan`, `mon`, case-insensitive), and `0` or `7` for Sunday.
  - When both day fields are restricted, a day matching either one matches.
- Cron is evaluated in the machine's local time zone. A local time skipped by a DST change does not run; a repeated one runs once.

**Runs**

- A run is a command message:
  - source `kernel`, priority `normal`;
  - payload: the schedule's `payload`, default `{}`;
  - `not_before` set to its due time.
- Each (extension, schedule, workspace) has at most one unfinished run.
- When a run ends in any terminal state (done, failed, dead, cancelled), the next one is created, due at the first occurrence after now. So:
  - runs never overlap;
  - occurrences missed while the daemon was down collapse into one catch-up run at boot.
- Occurrences:
  - `every`: the moment the schedule became active (enable, reload, or the boot that first creates it), plus whole multiples of the duration.
  - `cron`: the next matching minute.

**Lifecycle**

- Enable creates the runs of that workspace (and a global run if none exists).
- Disable cancels that workspace's outstanding runs, and the global run when no enabled workspace is left.
- A quarantine leaves runs pending (ADR 0086).
- A reload:
  - cancels the runs of schedules the new version removed or changed (in `every`, `cron`, `command`, or `payload`);
  - creates runs for new or changed schedules;
  - leaves unchanged schedules' runs alone.
- Uninstall cancels the unfinished runs with its other messages (`06` §6.8) and deletes its `schedules` rows. Forgetting a workspace removes its runs and rows (`04` §4.4).

**Storage.** Kernel schema 5 adds:

`schedules(extension, name, ws, anchor_at, due_at, message_id, PRIMARY KEY(extension, name, ws))`

- `ws` is `''` for a global run.
- `anchor_at` is when the schedule became active, the anchor for `every`.
- The next run is created in a new kernel unit after the unit that ended the current one.
- At boot, and after each such unit, every row whose message is finished or missing gets its next run, so a crash between the two never loses a schedule.

**Checks.** Structural validation (`EXT_MANIFEST_INVALID`, with hints) requires, for each schedule:

- its command is one of the extension's own commands, with access other than `user`, since runs come from the kernel;
- its `payload`, default `{}`, matches the command's input JSON Schema;
- its `cron` parses and can match some date (`0 0 30 2 *` never does).

The payload check needs a JSON Schema validator, which the sandboxed loader and hosts do not load, so it runs where manifests are validated on the kernel's main thread: at install (stage) and in `kernel.validate`. The command and cron checks run everywhere a manifest is validated.

A workspace being forgotten wants no runs; its rows go with the forget (`04` §4.4).

## Consequences

- `03` §3.4, `04` §4.1 (DDL) and §4.4, `05` §5.3, and `06` §6.8 state these rules.
- The kernel schema moves to version 5.
- Scenario M1.6-E40 names schema 5.

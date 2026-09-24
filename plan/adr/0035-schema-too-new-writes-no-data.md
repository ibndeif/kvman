# ADR 0035 — "Writes nothing" means no data is written

- **Status**: accepted
- **Date**: 2026-09-24
- **Milestone**: M1.1
- **Decided by**: the product owner

## Question

A database with a newer schema "refuses to open with `SCHEMA_TOO_NEW` and writes nothing" (`15` M1.1, D25). Reading the schema version with SQLite, even read-only, creates `kvman.db-shm` and an empty `kvman.db-wal`, because WAL mode needs them; URI filenames (`immutable=1`) are not available in `better-sqlite3`.

## Options

1. **No data written**: `kvman.db` stays byte-for-byte identical and `-wal` stays empty; the `-shm` index may appear.
2. Mirror the version in SQLite's header field `user_version` and read it with plain file I/O first.

## Decision

Option 1. The version check opens a read-only connection; refusing leaves `kvman.db` unchanged and `kvman.db-wal` empty or absent.

## Consequences

`04` §4.8, `00` D25, and `15` M1.1 say "writes no data".

# ADR 0057 — lists, export, and retention read every record

Status: the product owner's chosen solution for KVC-31 (9 October 2026), recorded before source on 2026-10-12. No public shape changes.

## Decisions

1. kvcoder reads a collection that can grow without limit in pages of 1000, with the store's `after` position (ADR 0040), until it has all of it. One helper does this.
2. **A chat's job list** shows every job that is still running, however old, and then its newest ended ones, to 50 rows in all, or more when more than 50 are running. Running ones stay first.
3. **An export** holds every turn, every artifact, and every subagent session of the chat. It is complete or it fails; it never writes a file that leaves records out.
4. **Retention** looks at every top-level session, keeps the newest `kvcoder.sessions.keep`, and deletes each older one that is idle. A running or waiting session is never deleted, and `keep` 0 deletes nothing, as before. One run finishes the whole policy.

## Verification

Scenarios M2.4-E178 to E180, written before source.

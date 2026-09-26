# ADR 0118 — Stage and install details

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`06` §6.2 and ADR 0015 leave four things open:

- the values of `contributions[].kind`, and which registrations count;
- when the stage reply carries the `NATIVE_CODE` warning;
- what installing an already installed digest does;
- whether resolving a source has its own time limit.

## Options

1. **register\* nouns; any `.node` file; succeed with no change; 5 minutes.**
2. Visible contributions only; `.node` files or build files; refuse a reinstall; the message deadline only.

## Decision

Option 1.

**Contributions.** Every UI registration is listed. `kind` is its register call's noun: `page`, `navGroup`, `navItem`, `toolbarItem`, `statusItem`, `panel`, `slot`, `action`, `rendererTarget`, `renderer`, `component`, `settingsSection`. The settings section has the id `<namespace>.settings`.

| Kind | Field |
|---|---|
| toolbar items, panels (the only UI definitions with a `slot` field) | `slot` |
| actions (their entity), renderers | `target` |

**`NATIVE_CODE`.** The warning appears when the snapshot contains at least one `.node` file, dependencies included. Its message is "uses native code", and its `params.packages` lists the packages that ship one.

**Warnings in the stage reply:** `NATIVE_CODE`, `DYNAMIC_IMPORT` (ADR 0117), and the manifest's validation warnings (ADR 0108).

**Reinstall.**

- Installing a token whose digest is already installed for that name succeeds with `{ name, digest }`. It adds no row and publishes no `kernel.extension.installed` event.
- A new digest of an installed name adds an `extension_versions` row and publishes the event. `active_digest` stays unchanged; switching versions is reload's job (M2.7).

**Fetch time limit.** Resolution (metadata, download, clone, checkout, pack, install) is killed after 5 minutes. It fails `EXT_SOURCE_INVALID` with "fetching the source took longer than 5 minutes". The loader keeps its own 10 s deadline.

**Staging.**

- A stage command's staging tree is deleted when the stage fails.
- A confirmation token lives in memory with its staged tree for 10 minutes.
- After a restart the staging trees are gone (boot deletes them), so an old token fails `CONFIRMATION_EXPIRED`.
- An expired staged tree is deleted when the next stage or install runs.

**Failure codes** (the implementer's recommendation, taken when the product owner declined the question and said to continue):

- **`EXT_SOURCE_INVALID`: the package's fault.**
  - A source problem, or a package check of stage step 2.
  - A builtin tarball whose unpacked tree does not match `digests.json`.
  - A module that fails to import, or that has no `defineExtension(...)` default export.
  - A top-level native import.
- **`EXT_MANIFEST_INVALID`: `setup`'s fault.**
  - `setup` throws; a file read the sandbox denies is one example.
  - `setup` is async, differs on its second run, or registers after returning.
  - `setup` does not finish within the loader's 10 s.
  - The manifest fails validation.
- **`EXT_INTEGRITY`** is kept for an installed snapshot that fails its rehash (§6.5).

**Who may send.** `stage` and `install` are `admin`: a person, the kernel, or an extension granted `kernel.admin`. As for `kernel.cancel` (ADR 0079), any other extension fails `CAPABILITY_DENIED`. `uninstall` has access `user`.

## Consequences

`06` §6.2 names the contribution kinds and the warnings.

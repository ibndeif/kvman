# ADR 0025 — Installing an extension by its source alone

The Extensions page's "Add an extension" form asked for a name and a source, and `kernel.extensions.install` took `{ name, source }`. For a `path:` folder the name is already in its package.json, so the field asked the person for what kvman can read. The product owner pointed this out (2026-10-06) and chose the answers below from alternatives.

Chosen, over the alternative in parentheses:

- **No name for any source** (over an optional name that only `npm:` and `bundled` need, and over a form-only change that needs a new read query): the source itself carries the name, so `install` takes only `{ source }`.
- **The preset file is unchanged** (over one source syntax everywhere): the file keeps `{ "<name>": <stored source> }`, so the loader, the trust records, and every existing preset stay as they are. `install` converts what the person typed into the name and the stored source.

## Decisions

1. **`kernel.extensions.install` takes `{ source }`.** `source` is one of:
   - `bundled:<name>`: a bundled extension; any other name fails `VALIDATION_FAILED`.
   - `npm:<name>@<exact version>`: the name is what lies between `npm:` and the last `@`, and the version must be exact (`exactVersionSchema`).
   - `path:<folder>`: the name is the `name` of the folder's package.json.
2. **The stored source is today's.** `bundled:<name>` is stored as `bundled`, `npm:<name>@<version>` as `npm:<version>`, and `path:<folder>` as it was given. The key is the name. `ExtensionSource` and `kernel.extensions.list` are unchanged; the new input type is `installSourceSchema` in `@kvman/sdk`.
3. **A `path:` folder resolves like the loader's** (plan 02 §2.9): against the folder of the preset file the edit writes (for the bundled preset, `<home>/presets/`), and an absolute folder as it is. A folder that has no readable package.json, or whose `name` isn't a package name, fails `VALIDATION_FAILED` with the folder. The kernel checks no more than the name; the loader checks the manifest at the next start, and an invalid one is undone (ADR 0024, 5).
4. **The other rules stay.** A name already in the preset fails `VALIDATION_FAILED`; the backup, the whole-file write, and `restartRequired: true` are as before (ADR 0010, 5 and 13; ADR 0024, 4).
5. **The old form is gone.** An input with `name`, or a source in the old shape (`npm:1.2.3`, `bundled`), fails `VALIDATION_FAILED` at the boundary; a preset file still stores them.
6. **kvcustomizer's `kvman extensions-install` takes `{ source }` too** (`kvcustomizer.app.extensions.install`). A `path:` folder still resolves against the workspace folder, must stay inside it, and must hold a package.json with a `kvman` field (`kvcustomizer/NOT_A_PROJECT`); it is stored as `path:<absolute folder>`. The rule that the project's name equals the `name` given is gone with the field. `bundled:` and `npm:` sources go to the kernel unchanged. `extensions-uninstall` keeps `{ name }`.
7. **The page's form has one field.** "Source" takes `npm:@acme/notes@1.2.3`, `path:/home/me/notes`, or `bundled:@kvman/kvcoder`; the "Name" field is gone.

## Consequences

- Plan 02 §2.12, plan 06 §6.6, and plan 09 §9.1 are corrected, and the `kvman` guides (`init`, `customizing`) and the developer docs show the new calls. This changes ADR 0010, 5 and 10 (`install { name, source }`), and ADR 0022, 6 (the name check).
- `@kvman/sdk` changes the input of `kernel.extensions.install` and gains `installSourceSchema`; a changeset records it, with kvcustomizer's and kvwebui's.
- No new dependency, no new command or query.

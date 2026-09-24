# 07 — Workspaces and Presets

## 7.1 Workspaces

- A workspace is a folder. Its ID is the SHA-256 (lowercase hex) of the UTF-8 canonical path, where the canonical path is `fs.realpath.native(path)` (symlinks resolved, and the real letter case on case-insensitive file systems); the same folder reached through two paths is one workspace.
- **A moved or renamed folder is a new workspace** (its path, and so its ID, changed). The old record stays in the switcher, marked "folder not found", until the person forgets it (`kernel.workspace.forget`), which deletes its data.
- `kernel.workspace.open {path}` validates the path (exists, is a directory, not inside `~/.kvman`), creates the `workspaces` row if new, and publishes `kernel.workspace.opened`.
- **Home workspace**: `~/kvman` is created and opened on first run so users who do not think in folders always have a place to work.
- Every message from the shell carries the workspace the user is currently in. Messages without a workspace are global and can only target global-scope types.
- `kernel.workspace.forget` removes the workspace record and all its scoped data (with confirmation); the folder itself is never touched.
- Each browser tab has one current workspace, shown in the switcher and sent with every request. Switching loads that workspace's UI registry (`08` §8.14); tabs in different workspaces work independently. A workspace with no applied preset (opened but never set up) shows the first-run question for that workspace.

**Preview workspaces** (for the builder, `11` §11.7):
- `kernel.workspace.preview.create {name, from}` (admin) creates a workspace of kind `preview` at `~/.kvman/previews/<name>/` — the only workspace path allowed under `~/.kvman`. Its applied preset starts as a copy of workspace `from`'s applied preset (same extensions and grants, `revision` 1), and its config rows are copied too, so the preview can use the same providers and tools. Only the dev version enabled there is limited (below).
- Preview workspaces are hidden from the workspace switcher and `kernel.workspaces.list` (unless `includePreview`), are never trusted (their `.kvman/` is empty), and hold only throwaway data.
- Inside a preview workspace an extension with `kernel.admin` may enable `dev:` sources without the grant dialog, sandboxed only, and never granting `process`, `network`, `kernel.admin`, or lower isolation (`06` §6.4). Everything else follows the normal rules.
- `kernel.workspace.forget` on a preview workspace (admin allowed) deletes its data and its folder.

## 7.2 Workspace file I/O and trust

`ctx.files` (capabilities `files.read` / `files.write`) is the only supported way for extensions to touch workspace files:

- Paths are resolved relative to the workspace root, normalized, and `realpath`-checked. Escaping the root (including through symlinks) fails `WORKSPACE_ESCAPE`. Anything under `~/.kvman` is refused.
- `<ws>/.kvman/**` is **trust-gated** for reads and writes: until the user trusts the workspace, reads fail `WORKSPACE_UNTRUSTED` and writes are refused (so nothing can plant a file it would later be trusted to read).
- Trust flow:
  1. `kernel.trust.preview {workspaceId}` → `{files: [{path, sha256}], confirmationToken}` for every regular file under `<ws>/.kvman/`.
  2. `kernel.trust.grant {confirmationToken, mode: 'once' | 'always'}`, confirmed in the shell's grant dialog (`08` §8.13), trusts exactly those files. `once` lasts until the kernel restarts (boot clears `once` records, `03` §3.9); `always` is stored.
  3. Trust is re-checked on every read: any added, removed, changed, or symlinked file closes the gate again until a new preview is confirmed. The check is cheap: the kernel keeps each trusted file's size, modification time, and inode, lists `<ws>/.kvman/` on each read, and rehashes only files whose stat changed.
  4. **Writes close the gate too**, including writes made by kvman's own extensions through `ctx.files` (for example the agent editing a rule file with `fs.write`) and by processes. This is intentional: nothing kvman runs can make its own instructions trusted; only the person can, by confirming a new preview. The `kernel.trust.changed {trusted: false}` event lets extensions such as `rules` drop the workspace part of their prompt sections at once.
- Raw shell commands (the `shell` extension) are **not** jailed. This is stated in the UI; only `ctx.files` is guarded.

## 7.3 Presets are apps

A preset describes what a workspace *is*: which extensions it runs, what the user sees, and how things are configured.

```ts
type Preset = {
  presetVersion: 1;                       // format version; a newer one fails with PRESET_INVALID "requires a newer kvman"
  id: string;                             // ^[a-z0-9-]{1,64}$
  name: string; description?: string; icon?: string;
  revision: number;
  app: {
    title: Text;                          // shown in the top bar brand zone (08 §8.3); a key in `translations` or a literal
    icon?: string;                        // lucide icon name
    theme?: { accent?: string;            // a CSS hex color '#RRGGBB'; default: the shell's accent
              mode?: 'system' | 'light' | 'dark' };   // default 'system'; the person's own theme preference wins (08 §8.16)
    home: string;                         // route of an active page without :params, e.g. '/files'
  };
  extensions: Record<string, {           // keyed by package name
    source: string;                       // npm:@acme/pdf@1.4.2 | git:…#sha | builtin:@kvman/agent
    integrity: string;                    // reproducible pin of the package itself (§7.4 "Versions"):
                                          //   npm: the registry's dist.integrity ('sha512-…'); git: 'git:<commit>';
                                          //   builtin: 'builtin:<kvman version>'
    digest?: string;                      // local only: the snapshot sha256 on this machine (applied copies);
                                          //   never part of shareable JSON
    enabled: boolean;
    grants: Capabilities;                 // exactly the requested and derived capabilities, plus the granted isolation
    disable?: string[];                   // functional switch: agent tool types turned off in this workspace
  }>;
  layout?: {                              // frame options (08 §8.3, §8.17)
    sidebar?: 'expanded' | 'collapsed' | 'hidden';
    statusbar?: 'shown' | 'hidden';
    order?: Record<string, string[]>;     // per slot: contribution ids in order; '---' = separator (frame.sidebar only)
  };
  hidden?: string[];                      // contribution ids not shown: pages, nav, toolbar/status items, panels,
                                          // actions, settings sections (still reachable: "Show hidden pages")
  labels?: Record<string, string | Record<string, string>>;   // by contribution id: one label, or one per locale
  pages?: Array<PageDef & { name: string }>;         // low-code pages owned by the preset, id `preset.<name>` (08 §8.5)
  navGroups?: Array<NavGroupDef & { name: string }>; // sidebar groups, id `preset.<name>`
  nav?: Array<NavItemDef & { name: string }>;        // sidebar items for its own pages or any extension page
  translations?: { default: string; catalogs: Record<string, Catalog> };  // text for its pages, nav, and app title (08 §8.16)
  config?: Record<string, Json>;        // non-secret workspace config per extension, validated against its schema;
                                        //   apply writes it to the workspace's config rows (§7.5)
  llm?: { defaults?: Partial<Record<'chat' | 'summary' | 'extension' | 'child', ModelRef>> };  // kernel.llm.defaults
};
```

What a preset can do without any code:
- pick extensions and grant capabilities;
- hide any page, nav group or item, toolbar or status item, panel, action, or settings section (`hidden`), and turn off agent tools (`disable`);
- order the items in every frame region and add sidebar separators (`layout.order`), and collapse or hide the sidebar and status bar;
- set the app title, icon, accent color, and home page;
- rename anything the user sees, per language (`labels`);
- **add new pages** composed from components and the commands, queries, and entities that enabled extensions already provide, with their own nav groups and nav items (`pages`, `navGroups`, `nav`); a preset's pages may send any type with access `all` or `user` of its enabled extensions (never `extensions` or `internal` ones, `02` §2.4), and use their public components;
- set workspace config (e.g. the agent's tool mode) and the workspace's default models (`kernel.llm.defaults`).

What a preset **cannot** do: hide the shell-only zones (brand, workspace switcher, notifications, connection, kvman menu, risk banner, grant dialog) or the recovery page; add toolbar items, status items, panels, slots, components, or widgets (those need an extension); run code; or grant anything by showing it. Hiding is presentation, not permission (`08` §8.17).

Example (a kiosk-style PDF app in Arabic and English):
```json
{ "app": { "title": "$t.app.title", "icon": "languages", "home": "/files" },
  "layout": { "sidebar": "collapsed", "statusbar": "shown",
              "order": { "frame.sidebar": ["pdf.documents", "pdf.nav-files", "---", "preset.nav-help", "settings.nav-general"] } },
  "hidden": ["inspector.traces", "settings.section.agent"],
  "labels": { "pdf.nav-files": { "en": "My documents", "ar": "مستنداتي" } },
  "pages": [{ "name": "help", "description": "How to use this app.", "route": "/help", "title": "$t.help.title",
              "view": { "type": "markdown", "source": "$t.help.body" } }],
  "nav": [{ "name": "nav-help", "description": "Help page.", "page": "preset.help", "label": "$t.help.title", "icon": "circle-help" }],
  "translations": { "default": "en", "catalogs": {
      "en": { "app": { "title": "PDF Translator" }, "help": { "title": "Help", "body": "Upload a PDF, then choose **Translate**." } },
      "ar": { "app": { "title": "مترجم PDF" }, "help": { "title": "مساعدة", "body": "ارفع ملف PDF ثم اختر **ترجمة**." } } } } }
```

## 7.4 Preset lifecycle

**Catalog** — installed presets live in the `presets` table. Built-in presets (`builtin = 1`) are seeded on first run and replaced by newer versions after upgrades.

**Ids** — a preset id matches `^[a-z0-9-]{1,64}$`. `kernel.preset.save` derives it from the name (lowercase, spaces and other characters to `-`, trimmed to 64) and appends `-2`, `-3`, … if taken. Import keeps the JSON's id: if it names a built-in preset, import fails `PRESET_READONLY`; if it names another catalog entry, the import preview says "replaces <name>" and the import replaces it (applied copies are never affected).

**Import** (inert):
```
kernel.preset.import.preview {json}  (query) → validate structure; reject secrets, local paths, dev/local sources,
                                       loose versions, missing integrity, trust records, local digests
                                       → summary (including "replaces <name>" when the id exists) + confirmationToken
kernel.preset.import {confirmationToken}  (access: user) → add to catalog. Downloads nothing, runs nothing.
```

**Apply** to a workspace (one confirmation):
```
kernel.preset.apply.stage {workspaceId, presetId} | {workspaceId, json}
  with json: the import checks run first (as import.preview); Confirm then imports and applies in one step
  stage and verify every extension whose version is not the active one (scripts disabled; the package must
    match the preset's integrity, else PRESET_INTEGRITY_MISMATCH; builtin: always the bundled version)
  → what will change: extensions to install (source, version, isolation, requested and derived
    capabilities in plain words with their reasons, read from the staged manifests), extensions enabled/disabled,
    version switches that also affect other workspaces (below) with their capability diffs there,
    notes ("dependencies differ from the preset author's build", "uses kvman's bundled agent 2.1.0 instead of 2.0.3"),
    pages added/removed, config changes, what it hides (every hidden platform-pack item by name, a count of the
    others), replacement warning
  → confirmationToken
kernel.preset.apply {confirmationToken}  (access: user — Confirm in the shell's grant dialog, 08 §8.13)
  1. re-verify the staged bytes (else CONFIRMATION_EXPIRED)
  2. with json: add it to the catalog (import)
  3. install the staged versions (not yet enabled anywhere)
  4. for each version switch: run the reload of 06 §6.6 to that version, with the grants confirmed for the
     other workspaces (EXT_ROLLBACK_BLOCKED or a failed migration fails the apply)
  5. validate the whole preset referentially against the resulting enabled set (06 §6.3)
  6. validate every config record against its extension's schema (CONFIG_INVALID); run data migrations
  7. commit in one unit of work: workspace_presets row (revision+1, each entry's digest set to the local
     snapshot), enable states, grants, and a workspace_config row for every extension the preset's config
     names (rows of other extensions are kept; kernel.config.changed for each written row)
  → event kernel.preset.changed {workspaceId, revision, cause: 'apply'}
  Any failure before step 4: newly staged snapshots are discarded and nothing changes. A failure after a
  version switch leaves that switch in place (it is a normal, complete reload) and the workspace keeps its
  previous preset; the error names what failed.
```

**Versions across workspaces** — the kernel runs **one version of each extension** for the whole home folder (`extensions.active_digest`; hosts are per extension, `03` §3.5). A preset's `integrity` therefore says which version the preset needs; it does not create a second copy:
- If the active version already matches (for `builtin:` entries, always), nothing is installed.
- Otherwise applying the preset **switches** the extension to the preset's version everywhere. The apply preview lists the other workspaces where it is enabled and the capability diff for each; the one Confirm covers them; the switch is a normal reload (`06` §6.6). If the switch is a rollback that the data does not allow, the apply fails `EXT_ROLLBACK_BLOCKED`.
- The npm `integrity` pins the package's own files. Its dependencies are resolved at install and may differ from the author's machine; the preview says so, and the local snapshot digest (never shared) protects this machine against tampering (`06` §6.5).
- Every reload, upgrade, or rollback updates `source`, `integrity`, and `digest` of that extension in every applied preset in the same unit of work (`06` §6.6 step 5), so applied copies always name the running version.

**Edit** — `kernel.preset.update {workspaceId, patch, revision}` applies a JSON Merge Patch (RFC 7396) to the applied copy (layout, order, hidden items, labels, pages, nav, translations, app, and the `extensions` fields below), re-validates the whole result (`06` §6.3), and publishes `kernel.preset.changed {cause: 'update'}`; enable and disable publish it with `cause: 'enable' | 'disable'`. Every write bumps the revision, and the shell refreshes the UI registry on this one event (`08` §8.6). A stale revision fails `PRESET_STALE`. The applied copy is independent of the catalog template.
- **Config is not patched here.** A patch with a `config` key fails `PRESET_INVALID`; config is changed with `kernel.config.set` (§7.5), which never changes the preset's revision.
- **Arrays are replaced whole** (RFC 7396 has no array merge): to change one page, the patch carries the complete `pages` array. `null` removes a key.
- **Patching `extensions`** is limited to entries already in the preset and to three fields: `enabled`, `grants` (which must equal the extension's requested and derived capabilities, plus an allowed isolation), and `disable`. Adding or removing an entry, or changing `source`, `integrity`, or `digest`, fails `PRESET_INVALID` (use apply, enable, or reload). Such a patch is a grant command: accepted only from a user through the grant dialog (`CALLER_NOT_ALLOWED` otherwise).

**Save as** — `kernel.preset.save {workspaceId, name, description?}` copies the applied preset into the catalog, with the workspace's non-secret config rows as its `config` and without local `digest`s, after the same shareability checks as import.

**Export** — `kernel.preset.export.get {presetId} | {workspaceId}` returns shareable JSON (`integrity` kept, `digest` removed; for a workspace, `config` from its config rows).

**Delete** — `kernel.preset.delete {presetId}` removes a catalog entry; built-in presets cannot be deleted (`PRESET_READONLY`). Applied copies are never affected by catalog changes. Every catalog write publishes `kernel.preset.catalog.changed`.

**Repo preset** — if a trusted workspace contains `<ws>/.kvman/preset.json`, the shell offers "Apply this folder's preset": `kernel.preset.apply.stage {workspaceId, json}`, then one Confirm in the grant dialog imports and applies it. The file is never applied silently.

## 7.5 Config values

- Storage (`04` §4.7): global values in `global_config`, workspace values in `workspace_config` (one row per workspace and extension, each with its own revision). The applied preset holds no config; applying a preset writes its `config` into these rows.
- Resolution order for extension X in workspace W: schema defaults < global value < W's `workspace_config` row for X.
- Writes: `kernel.config.set {extension, scope, workspaceId?, value, revision}` (the revision of that row) from the settings UI, or `ctx.config.set` by X itself, applied in its unit of work (`04` §4.2). Foreign writes are impossible through the SDK and rejected at the kernel (`CAPABILITY_DENIED`).
- Reads by other extensions: `ctx.query('kernel.config.get', {extension})` returns values with secrets redacted.
- Every write validates against the schema (`CONFIG_INVALID`), bumps that row's revision (a stale one fails `CONFIG_STALE`), and publishes `kernel.config.changed`. A config write never changes the applied preset's revision, so it does not refresh the UI registry (`08` §8.6).
- Secrets are set with `kernel.secret.set {extension, name, value}` and cleared with `kernel.secret.clear`. A blank masked field in a form keeps the existing value; clearing requires an explicit action.

## 7.6 Presets shipped with kvman

The **platform pack** (`settings`, `presets`, `extensions`, `inspector`) is in every built-in preset so users can always manage the app. A preset may hide or disable them like any extension; the kvman menu and the recovery page remain the way back (`08` §8.17).

| Preset | Extensions (beyond platform pack) | Notes |
|---|---|---|
| **Coding Agent** (default for developers) | agent (tool mode `bash`), llm-providers, shell, fs, todo, interviewer, rules, skills, persona, local-guard | the full coding agent; `local-guard` asks before shell commands reach kvman itself |
| **Assistant** | agent (tool mode `direct`), llm-providers, fs (read-only tools), todo, interviewer, persona | no shell; safer for non-technical users |
| **Extension Builder** | agent (direct), llm-providers, builder, fs (read-only tools), todo | the self-extension app (`11`); writes only to dev projects |
| **Minimal** | — | platform pack only; used by the recovery page |

The first-run flow asks one question ("What do you want to do?") and applies the matching preset to the Home workspace. `examples/pdf-translator` ships a **PDF Translator** preset as the reference third-party app.

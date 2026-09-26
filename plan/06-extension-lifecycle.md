# 06 — Extension Lifecycle

## 6.1 Sources

| Source | Form | Integrity (the shareable pin, `07` §7.4) | Shareable in presets |
|---|---|---|---|
| npm | `npm:@acme/pdf@1.4.2` (exact version only) | the registry's `dist.integrity` (`sha512-…`), checked against the downloaded tarball | yes |
| git | `git:https://host/repo.git#<40-hex commit>` (`https`, `ssh`, `git` transports only) | `git:<commit>` | yes |
| builtin | `builtin:@kvman/agent` (tarballs bundled with the kvman release) | `builtin:<kvman version>` | yes (always resolved to the bundled version) |
| dev | `dev:<name>@<n>`: builder projects built by `kernel.dev.build` (`11` §11.5), or a developer's folder staged with `kernel.dev.folder.stage` (`kvman ext dev`, `12` §12.5). `<name>` is the project name, or for a folder the package name without `@` and with `/` replaced by `-` (`@acme/pdf` → `acme-pdf`), so it never contains `@`; `<n>` counts up from 1 | none | no |
| local | `local:<sha256>` (an installed snapshot referenced by digest, developer use) | none | no |

Two hashes, two jobs: the **integrity** pins the package itself and is the same on every machine; the **digest** hashes the whole installed snapshot (dependencies included) and protects this machine against tampering (§6.5). Only the integrity is shared.

Loose ranges, tags, branches, bare names, and `file:` paths in presets are rejected (`PRESET_UNSHAREABLE`). For git: every command runs with `-c protocol.ext.allow=never -c protocol.file.allow=user` and `--` before the URL.

## 6.2 Install pipeline

```
kernel.extension.stage {source}
  1. resolve into extensions/staging/<uuid>/ with install scripts disabled:
     npm and git: the kernel's bundled pnpm (a dependency of @kvman/kernel, run with the kernel's own Node;
       never a global pnpm or corepack): pnpm add --ignore-scripts --prod, node-linker=hoisted,
       so the snapshot owns every byte (needs the network); npm packages come from the registry named by
       KVMAN_NPM_REGISTRY at kernel start (default https://registry.npmjs.org/; tests use a local registry)
     builtin: the release tarball already contains the package and all its dependencies (packed at release
       build time), so it is only unpacked and checked against the digest list shipped with the release; no
       network, no pnpm
     dev: the version snapshot recorded by kernel.dev.build (already bundled; 11 §11.5), or the folder given to
       kernel.dev.folder.stage (its dependencies installed like npm's); local: the existing snapshot
  2. reject:
     - symlinks leaving the tree and missing package.json fields (name, version, description, main)
     - a `peerDependencies['@kvman/sdk']` range that the running kvman's SDK does not satisfy
       (EXT_SOURCE_INVALID "needs @kvman/sdk <range>; this kvman has <version>"); hosts always resolve
       @kvman/sdk to the kernel's own copy, so the snapshot never contains one (pnpm runs with auto-install-peers=false)
     - a `main` file that does not exist: kvman never runs build scripts, so the package must contain its
       built JavaScript (EXT_SOURCE_INVALID "publish or commit the built files")
     - undeclared imports: every .js/.mjs/.cjs file is scanned with es-module-lexer; each static import and
       each dynamic import with a literal specifier must name a Node built-in (node:*), a relative file inside
       the tree, or a package in dependencies / peerDependencies (EXT_SOURCE_INVALID, naming file and
       specifier); a dynamic import with a computed specifier is a warning
  3. build the canonical **file list** (every file's path, size, sha256) → snapshot digest
  4. run setup in the sandboxed loader process (read-only access to the staged tree, no child
     processes, no native addons, no kernel access, deadline 10 s) with a recording ext → the extension's **manifest** (05 §5.12)
     (a module that loads a native addon at its top level fails here, see "Native dependencies" below)
  5. validate the manifest (§6.3)
  → reply StageResult (ADR 0015):
      { name, version, title, summary?, description, namespace, source, digest, integrity? (absent for dev:/local:),
        capabilities: { requested: [{ name, reason, types? }], derived: { subscribes, providesLlm } },
        isolation: { mode, reason } | null,
        types: [{ type, kind, access?, agentTool }], contributions: [{ id, kind, slot?, target? }],
        warnings: Issue[] (severity 'warning', e.g. code 'NATIVE_CODE': "uses native code"),
        translations: { [locale]: { title?, summary?, reasons: { [capability]: text } } }
          (the staged catalogs' entries for title, summary, and reasons, every shipped locale),
        confirmationToken, expiresAt (10 min) }

kernel.extension.install {confirmationToken}
  6. re-verify staged bytes against the digest (else CONFIRMATION_EXPIRED)
  7. atomically move to extensions/snapshots/<digest>/ (+ manifest.json and files.json, the file list)
  8. record extension_versions row (with integrity); set active_digest if this is the first version
  → event kernel.extension.installed
```

Installing never enables. Enabling happens through a workspace preset (§6.4). Interrupted staging trees are deleted at boot.

**Native dependencies** (packages with compiled `.node` addons, e.g. image or PDF libraries):
- They must be imported inside handlers (`const sharp = (await import('sharp')).default`), never at the top level of a module that `setup` loads. The install-time loader forbids native addons, so a top-level import fails staging with `EXT_SOURCE_INVALID` ("import native dependency X inside a handler").
- At runtime native addons load only in `shared` or `dedicated` isolation. A `sandboxed` host runs without `--allow-addons`, so the import fails with `CAPABILITY_DENIED`. An extension that needs one requests `dedicated` isolation with `ext.requestIsolation` and a reason; the stage reply lists "uses native code" among its warnings, and the grant dialog shows it.

## 6.3 Validation (also `kernel.validate`)

Structural:
- Manifest matches the protocol schema; `meta.name` matches `package.json`; namespace is valid (lowercase, kebab-case, 2–32 characters) and not reserved (`kernel`, `ui`, `frame`, `sys`, `preset`).
- `setup` is synchronous, touches only `ext`, and records the same manifest when run twice (`05` §5.1).
- Every public name passed to a `register*` call (message types, entities, UI contributions, slots, renderer targets, components) is written in full and starts with `<namespace>.`; the hint shows the full name (`registerCommand('translate')` → "did you mean 'pdf.translate'?"). No duplicates; no name used for two kinds. UI names are unique across UI kinds, and entities, collections, logs, schedules, errors, providers, and models are unique within their own kind (`05` §5.3).
- Every error code is registered once with `registerError`, is `<namespace>/<UPPER_SNAKE>`, and has a description and an English `title`.
- Names follow the naming grammar (`02` §2.4): warnings for installed extensions, errors for builder-generated ones (the strict severity arrives with the builder in M6, ADR 0108).
- Types used as `onReply` continuations, `defer({ onAbort })` targets, or `ctx.process.spawn({ onExit })` targets must be the extension's own `internal` commands (checked when the message is sent, since handler code is not analyzed).
- Every schema converts to JSON Schema (Zod 4 `z.toJSONSchema`, draft 2020-12) without loss of structure: transforms, preprocess, pipes, custom types, and other parts JSON Schema cannot express fail (`EXT_MANIFEST_INVALID`); refinements (`.refine`, `.superRefine`) are allowed and are enforced only by the host (`05` §5.12). Every type has a description, and so does every field of the config schema, at every depth (`00` rule 5, ADR 0106).
- Every `lane` is a valid lane template whose `$payload` paths exist in the input schema (`02` §2.6). A subscription's lane is checked against the payload of its own or a `kernel.*` event here, and against a foreign event's payload at enable; a wildcard subscription's lane is not checked. A path exists when some reading of the schema declares it: `properties`, `$ref`, any branch of `anyOf`/`oneOf`/`allOf`, or an `additionalProperties` schema (ADR 0109).
- The manifest is at most 5 MB (`EXT_MANIFEST_INVALID`).
- Capabilities cover what is referenced statically: each type in `requireTypes` is its own, a `kernel.*` type, matched by its `calls` patterns, or matched by one of its subscriptions (ADR 0107); and every command or query that its pages, panels, actions, forms, and composite components send must be its own, covered by its requested `calls`, or a `kernel.*` type its requested capabilities allow. Subscriptions to foreign events are listed as derived capabilities (`05` §5.7).
- **Access** (`02` §2.4): a declarative view (page, panel, action, form, button) never targets a type with access `extensions` or `internal`, because its sender is the person; a widget never targets a type with access `user` or `internal`. `slash` appears only on commands with access `all` or `user`; an `agentTool` has access `all` or `extensions`. `subscribe` never names a live event, a query handler never calls `ctx.live` (checked at runtime: `CAPABILITY_DENIED`), and `registerEvent` with delivery `live` declares `chunk` instead of `payload`.
- UI: pages, panels, toolbar and status items, actions, renderers, and composite components are valid view trees (`08`); every binding path is well-formed; referenced components exist in the shell's library, are registered by the extension, or are public components listed in `requireComponents`; composite components do not reference themselves directly or indirectly.
- **Containers accept only what they declare** (`08` §8.4, §8.8):
  - every contribution's kind is in its slot's `accepts` (frame slots from the catalog in `@kvman/protocol`, extension slots from `registerSlot`); the namespace `frame` cannot be registered;
  - a `{ "type": "slot" }` node names one of the extension's own slots, and its `props` satisfy the slot's schema; contributions' `$slot.*` paths exist in that schema;
  - every node's children are allowed by its component's `children` rule; `{ "type": "children" }` appears only in a composite that declares `children`.
- **View rules** (`08` §8.3, §8.5, §8.7): pages do not declare the reserved search parameters `ws`, `side`, or `embed`; an action with placement `palette` uses no `$item` binding; `refreshOn` names durable or transient events only; `openDialog` nests at most 2 deep; a `page` node's `entity` and `record` are set together; an entity's `route` matches the route of one of the owner's pages (its `$item` paths filling that page's `:params`); `settingsSections` appears only in views of an extension holding `kernel.admin`.
- **Component authority** (`08` §8.9): a `public` composite contains no command action of its own (only `$props.*` actions, `navigate`, and `openDialog` without commands); `private` components are used only by their owner's views.
- **Text** (`08` §8.16): every `$t` key written in a view, contribution, or schema `.meta` exists in the owner's default catalog; every catalog message is valid ICU; every parameter a message uses is passed; `registerTranslations` is called at most once. A literal user-facing `Text` is a warning (an error for builder-generated extensions); a key missing from a non-default catalog is a warning.
- Widgets may not declare `calls` for `access: 'user'` or `'internal'` types (a widget's calls are made as its extension, never as the user).

Referential (at enable or preset apply, against the workspace's enabled set):
- `requireTypes` are provided by enabled extensions.
- Every type referenced by pages, actions, and forms exists and the payload bindings satisfy its input schema. An extension's views may target only its own types, types covered by its granted `calls`, and the `kernel.*` types its capabilities allow (`03` §3.8), never another extension's `internal` types, and never `extensions`-only types (the person is the sender). Power-granting kernel commands may appear only as the target of an `openGrantDialog` action (`08` §8.13). Preset pages may target every type with access `all` or `user` of the preset's enabled extensions and the `kernel.*` queries open to all (`08` §8.7).
- Every component referenced by name is provided by the shell or by an extension enabled in the workspace, and its props satisfy the component's props schema.
- **Foreign placements.** A panel or toolbar item aimed at another extension's slot, an action on another extension's entity type, and a renderer for another extension's target are checked against that slot, entity, or target when its owner is enabled in the workspace (kind in `accepts`, `$slot.*` paths, `$item` paths against the entity or item schema). When the owner is not enabled, the contribution is **inactive**: it is left out of the UI registry and validation reports a warning, not an error. It becomes active when the owner is enabled; no re-install is needed.
- **Routes.** Every page route starts with `/`, contains only lowercase segments and `:param` segments, and does not start with `/_kvman` or `/api`. Routes of the pages active in a workspace (enabled extensions and the preset's pages) are unique after replacing each `:param` with a wildcard; a clash fails enable or apply with `ROUTE_CONFLICT`, naming both pages.
- `requireComponents` are provided, as `public`, by extensions enabled in the workspace. Composite nesting, followed across extensions, has no cycle and at most 8 levels.
- Preset `hidden`, `labels`, and `layout.order` name existing contribution ids and slots (unknown ids are warnings, because a preset may list contributions of extensions it does not enable). Preset nav items point to pages that exist; `app.home` matches the route of an active page and has no `:param` segment (`PRESET_REFERENCE_MISSING` otherwise).
- LLM provider IDs do not collide with a provider of another enabled extension (`PROVIDER_CONFLICT`).

Errors are structured and include a fix hint where possible:
```json
{ "code": "VALIDATION_FAILED", "issues": [
  { "path": "actions.translate.command", "message": "Unknown command \"pdf.translte\"", "hint": "Did you mean \"pdf.translate\"?" } ] }
```

## 6.4 Enable per workspace

- A workspace's applied preset lists extensions with `enabled`, the granted capabilities, and functional toggles (`disable`). `kernel.extension.enable {workspaceId, name, grants}` / `kernel.extension.disable {workspaceId, name}` edit that preset (revision bump), publish `kernel.preset.changed` with `cause: 'enable' | 'disable'` (plus `kernel.extension.enabled` / `.disabled`), and are what the Extensions page calls. `enable` grants capabilities, so it is confirmed in the grant dialog (`03` §3.8). Sending `enable` for an extension that is already enabled replaces its grants; this is how a person changes capabilities or isolation.
- If the extension is not yet in the applied preset's `extensions`, `enable` adds it with the active digest's source (`builtin:`, `npm:`, `git:`, `dev:`, or `local:`).
- Enable checks: the workspace has an applied preset (else `PRESET_REQUIRED`: choose a preset first; the shell shows the first-run screen there), snapshot verified, namespace not taken by another enabled extension in this workspace, **every** requested capability granted (grants are all or nothing; `CAPABILITY_DENIED` lists what is missing), isolation granted (a refused request for lower isolation means `sandboxed`), referential validation passes, config valid (`04` §4.8), data migrations succeed.
- Disable fails `EXT_IN_USE`, listing the dependents, while another enabled extension in the workspace requires its types (`requireTypes`) or its public components (`requireComponents`); the user disables the dependents first or together.
- Disable: new messages to its types fail `HANDLER_UNAVAILABLE`; in-flight invocations finish; pending messages stay pending (they run if re-enabled, or are discarded by `kernel.message.discard`). A message still pending 7 days after its handler's extension was disabled in its workspace is cancelled by housekeeping (`04` §4.9). Its pages and contributions disappear from that workspace; its data stays.
- **Global-scope types** (registered with `scope: 'global'`, e.g. `llm-providers.login.start`) have no workspace. The router delivers them while the extension is enabled in at least one workspace (else `HANDLER_UNAVAILABLE`), also when a message to them carries a workspace (it is stored without one, ADR 0048), and the invocation runs with the **intersection** of the extension's grants across those workspaces and the most isolated of their isolation levels. There is no global enable.
- **Preview workspaces** (`07` §7.1): `enable` may be sent by an extension with `kernel.admin`, without the grant dialog, only for `dev:` sources, always `sandboxed`, and never granting `process`, `network`, `kernel.admin`, or lower isolation.

## 6.5 Loading and isolation

- Hosts load an extension lazily on its first message and unload it when idle (`03` §3.5). Loading imports the snapshot's entry from `extensions/snapshots/<digest>/` and runs `setup` to bind the registered functions.
- Before first load in a kernel process (and for every enabled extension at boot, `03` §3.9 step 4), the snapshot is rehashed; mismatch → the extension is quarantined with reason `EXT_INTEGRITY`, no retry. The recovery page offers Rollback to another verified snapshot, or Disable.
- Isolation is granted, not chosen by the extension. Built-in extensions run `shared`. Every other extension runs `sandboxed` unless it requested `shared` or `dedicated` with `ext.requestIsolation` **and** the user granted it, after a warning that such code has full access to this computer. The user may raise isolation at any time. Builder-generated extensions are always `sandboxed` unless the user explicitly lowers it later on the Extensions page.

## 6.6 Hot reload and upgrade

`kernel.extension.reload {name, digest?, grants?}` (also used for upgrades, rollback, and by the builder); without `digest` it reloads the active digest:
1. Validate the target version's manifest referentially in every workspace where the extension is enabled, including the views of every enabled extension that uses its public components against the new props schemas (`08` §8.9). Any failure blocks the reload (`VALIDATION_FAILED`, listing what would break).
2. **Capability diff.** If the new manifest requests capabilities (or isolation) not granted in a workspace where it is enabled, the reload needs `grants` for each such workspace, and a reload with `grants` is a grant command confirmed in the shell's grant dialog, which shows the diff (`03` §3.8). Without them it fails `EXT_GRANTS_REQUIRED`, listing the workspaces and the new capabilities; the only change is that the target digest is recorded as `pending_digest`, which shows the extension as "needs approval" on the Extensions page, the recovery page, and the risk banner. A later successful reload clears it. Capabilities the new version no longer requests are removed from the grants.
3. Stop dispatching new messages to the extension; let in-flight invocations finish (up to 10 s, then abort → redeliver). While dispatch is stopped, commands and event deliveries are admitted and wait in their queues; queries fail at once with `HANDLER_UNAVAILABLE` (retryable, `retryAfterMs: 1000`), and the shell retries a failed query once after that delay.
4. Run data migrations for the new storage version with the target digest's code, recording `extensions.migrating = { digest, grants }` first; failures and crash recovery follow `04` §4.8.
5. In one unit of work: swap `active_digest`, clear `migrating` and `pending_digest`, and update the extension's entry in every applied preset that lists it (new `source`, `integrity`, `digest`, and, where it is enabled, the new grants) (publishing `kernel.preset.changed {cause: 'enable'}` where grants changed); hosts stop using the old code. Node cannot unload an ES module, so hosts are **replaced**, never patched: dedicated and sandboxed hosts of the extension restart; each shared worker that has loaded the old version stops receiving new invocations, finishes its in-flight ones (up to 10 s, then abort → redeliver), and exits, while a fresh worker takes its place in the pool.
6. Resume dispatch; publish `kernel.extension.reloaded {workspaceId, name, digest}` once for each workspace where it is enabled. The shell refetches the UI registry (`08` §8.6).

Failure at any step leaves the previous version active.

## 6.7 Versions and rollback

- `extension_versions` keeps every installed digest with its source and manifest.
- `kernel.extension.rollback {name, digest}` performs the reload of §6.6 to an older installed digest, including its capability diff, if the data schema allows it (`04` §4.8); otherwise `EXT_ROLLBACK_BLOCKED` with the reason.
- Old snapshots are kept until the user prunes them; the latest 5 per extension are always kept.

## 6.8 Uninstall

- Allowed only when the extension is disabled in every workspace (`EXT_IN_USE` otherwise, listing the workspaces).
- Options: **keep data** (default; reinstalling the same name finds it, including its presets' entries and config) or **delete data**, which removes, in one transaction: every kv, doc, and log row with that owner (all workspaces and global); its blob refs; its `global_config` row; its `schema_versions` row (so a reinstall starts with no data); its notifications; its `llm_models` rows; its `workspace_config` rows; and its entry in every workspace's applied preset, publishing `kernel.preset.changed {cause: 'disable'}` for each changed workspace. Its secrets are removed from `secrets.json` after the commit (`04` §4.7).
- Every unfinished message handled by it (commands, event deliveries, timers, deferred commands) is marked `cancelled`, and waiters get `CANCELLED`; deferred commands' `onAbort` is not sent, because the owner is gone. Snapshots are removed unless `keepSnapshots`.
- Published events and finished messages remain in the trace store until retention.

## 6.9 Builtin extensions and first run

- The kernel package ships core extensions as self-contained tarballs (each includes its dependencies) plus a digest list, so first run and upgrades work offline. `pnpm build` produces them: `scripts/pack-builtins` packs every `extensions/*` package into `packages/kernel/builtin/<name>.tgz` and writes `digests.json`, so development builds and tests install core extensions exactly as a release does. On first run (and on upgrade), the kernel installs them through the same pipeline with source `builtin:<name>`, so they are snapshotted, verified, and versioned like any other extension; core extensions never bypass the install pipeline.
- First run also seeds the built-in presets and creates the Home workspace (`03` §3.9). No preset is applied until the person chooses one on the shell's first-run screen (`08` §8.3, `07` §7.6).

## 6.10 Capability grant flow

```
stage/preview ──▶ grant dialog shows: title, summary (meta.summary, else the English description),
                  publisher/source, digest, isolation, capabilities in plain words (kvman catalog) with the
                  extension's reasons (its own catalog, in the person's language) ("can run shell commands: runs pdftotext",
                  "can use your AI models", "can call: fs.file.get", "receives: agent.session.deleted",
                  "can call: agent.prompt.section.set", "sees every tool call the agent makes: agent.tool.call.created",
                  "provides AI models: ollama — receives your prompts")
install ──▶ nothing enabled yet
enable in a workspace / apply a preset ──▶ user grants all requested capabilities, or does not enable
                                             (no partial grants; a request for lower isolation may be
                                             refused, and the extension then runs sandboxed)
upgrade/reload with new capabilities ──▶ kernel.extension.reload {grants} through the grant dialog,
                                           which shows the capability diff; until confirmed, the new
                                           version is installed but not active (EXT_GRANTS_REQUIRED)
```

The grant decision is stored in the workspace's applied preset, so it travels with presets as a request that the user confirms again on apply.

Every step that grants capabilities is an `access: 'user'` kernel command, confirmed in the **shell's grant dialog** (D41, `08` §8.13). Extensions such as `extensions`, `presets`, and `builder` prepare the step (stage, install, compute the preview) and offer a button that opens the dialog; the dialog is drawn by the shell from kernel data, and only its Confirm button sends the command. No extension, process, or widget can grant capabilities, including to itself, and no extension can draw its own "Allow" button for them.

# 05 — Extension API

## 5.1 Anatomy

An extension is an npm package:

```
@acme/pdf/
  package.json            name, version, description, main: dist/extension.js, peerDependencies: @kvman/sdk
  src/extension.ts        export default defineExtension(meta, setup)
  pages/files.json        optional: page views as JSON files (imported and registered in setup)
  pages/file-detail.json
  locales/en.json         translation catalogs, one per language (imported and registered in setup)
  locales/ar.json
  widgets/viewer.html     optional widget components (sandboxed)
  test/*.test.ts          tests using @kvman/testkit
```

- Identity comes from `package.json` (`name`, `version`, `description`). `meta.name` repeats it and MUST match.
- The default export is the **only** entry point: `defineExtension(meta, setup)`.

**Two objects, two phases.** An extension talks to kvman through exactly two objects, and they are never mixed:

| Object | Where | When it runs | What it can do |
|---|---|---|---|
| `ext` | the `setup(ext)` function | at install (recorded) and each time a host loads the extension | **register** things: commands, queries, subscriptions, storage, config, UI, providers, models, capability requests. Nothing else. |
| `ctx` | every handler `handle(input, ctx)` | each time a message is delivered | **do** things: send, publish, read and write its storage, call the LLM, spawn processes. No registration. |

**Setup rules** (checked by the loader and by `kernel.validate`):
1. `setup` is synchronous and deterministic. It receives only `ext`: no storage, config, network, file, or clock access. Registrations cannot depend on runtime state.
2. Every registration needs a `description` (and handlers SHOULD have `examples`). Missing descriptions fail validation (D52).
3. `ext` is closed when `setup` returns; calling it later throws.
4. The kernel implements `ext` (the SDK holds `defineExtension`, which returns a frozen `{ meta, setup }`, and the `Ext` types; ADR 0041). At install, the kernel runs `setup` in a **sandboxed loader process** (read-only access to the staged package, no child processes, no native addons, deadline 10 s) with a recording `ext`. The recording, with functions replaced by references and schemas converted to JSON Schema, is the extension's static **manifest** (§5.12), stored in the snapshot. Functions are referenced by what registered them (`command:pdf.translate`, `subscription:agent.session.deleted`).
5. When a host loads the extension, it runs `setup` again to bind the functions. If the registrations differ from the recorded manifest, loading fails (`EXT_MANIFEST_INVALID`) and the extension is quarantined (`03` §3.6).

**No in-memory listeners.** Registering does not create a listener object in the kernel. The kernel keeps only the manifest (names, schemas, function references) in its registry. When a message arrives, the kernel finds the registered handler in the registry, delivers the message to a host, and the host calls the function it bound at load. Hosts load extensions lazily on their first message and unload idle ones (`03` §3.5). Memory therefore grows with the number of *running* invocations, not with the number of registrations.

## 5.2 Complete example

```ts
import { defineExtension, z } from '@kvman/sdk';
import filesPage from '../pages/files.json' with { type: 'json' };
import fileDetailPage from '../pages/file-detail.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };
import ar from '../locales/ar.json' with { type: 'json' };

const File = z.object({
  id: z.string(), name: z.string(), blobId: z.blobId(),
  status: z.enum(['importing', 'ready', 'translating', 'translated', 'failed']),
  pages: z.number().int().optional(), translatedBlobId: z.blobId().optional(),
  createdAt: z.number(),
});

export default defineExtension({
  name: '@acme/pdf',
  namespace: 'pdf',
  title: '$t.meta.title',                               // shown to people: "PDF Translator" / "مترجم PDF"
  summary: '$t.meta.summary',                           // one sentence for people (grant dialog, extensions page)
  icon: 'file-text',
  description: 'Import PDF files and translate them with the configured AI model.',
}, (ext) => {
  // What it needs from the user
  ext.requestCapability('llm', { reason: '$t.reasons.llm' });     // "Translates documents with your AI model"
  ext.requestCapability('ui', { reason: '$t.reasons.ui' });       // "Shows a notice when a translation finishes"

  // Data (private names: only this extension sees them; data version 1 needs no registerDataVersion)
  ext.registerCollection('files', {
    description: 'Imported PDF files.', schema: File, indexes: [['status', 'createdAt']],
  });
  ext.registerEntity('pdf.file', {
    description: 'An imported PDF file.', title: '$t.entities.file', schema: File, idField: 'id',
    display: { title: '$item.name', subtitle: '$item.status', icon: 'file-text' },   // bindings over one record
    route: '/files/{{ $item.id }}',                                                  // its detail page
  });
  ext.registerConfig({
    scope: 'workspace',
    schema: z.object({
      defaultLanguage: z.string().default('ar').describe('Target language code')
        .meta({ label: '$t.settings.defaultLanguage' }),
    }),
  });

  // Text shown to people (08 §8.16)
  ext.registerTranslations({ default: 'en', catalogs: { en, ar } });

  // How it fails (shown translated from problems.NOT_FOUND; the title is the English fallback)
  ext.registerError('pdf/NOT_FOUND', { description: 'The file id does not exist in this workspace.', title: 'No such file' });

  // What it announces
  ext.registerEvent('pdf.imported', { description: 'A PDF was imported.', payload: z.object({ fileId: z.string() }) });
  ext.registerEvent('pdf.translated', {
    description: 'A translation finished.', payload: z.object({ fileId: z.string(), blobId: z.blobId() }),
  });
  ext.registerEvent('pdf.progress.updated', {            // live: sent at once to open screens, keyed by file id
    description: 'Translation text for one file, as it is generated.', delivery: 'live', chunk: 'text',
  });

  // What it does
  ext.registerCommand('pdf.import', {
    description: 'Import an uploaded PDF blob.',
    input: z.object({ blobId: z.blobId() }), output: z.object({ fileId: z.string() }),
    lane: 'blob:{{ $payload.blobId }}',                   // one at a time per blob (02 §2.6)
    examples: [{ blobId: 'sha256…' }],
    async handle({ blobId }, ctx) {
      const info = await ctx.step('inspect', () => inspectPdf(ctx, blobId));
      ctx.store.blobs.keep(blobId);                       // received in a z.blobId() field → keep our own ref
      const id = ctx.ids.new();
      ctx.store.collection('files').put({ id, name: info.name, blobId, status: 'ready',   // buffered until commit
                                           pages: info.pages, createdAt: ctx.now() });
      ctx.publish('pdf.imported', { fileId: id });
      return { fileId: id };
    },
  });

  ext.registerCommand('pdf.translate', {
    description: 'Translate a PDF to a target language.',
    input: z.object({ fileId: z.string(), lang: z.string().describe('Target language code') }),
    output: z.object({ blobId: z.blobId() }),
    lane: 'file:{{ $payload.fileId }}',
    concurrency: 2, timeoutMs: 300_000,
    agentTool: { title: 'Translate PDF' },
    async handle({ fileId, lang }, ctx) {
      const files = ctx.store.collection('files');
      const file = await files.get(fileId);
      if (!file) throw ctx.problem('pdf/NOT_FOUND', { params: { fileId } });
      const text = await ctx.step('extract', () => extractText(ctx, file.blobId));
      const out = await ctx.llm.complete({                  // kernel LLM service (§5.11)
        purpose: 'extension', live: { text: `pdf.progress.updated:${fileId}` },   // relays deltas as that live event
        system: `Translate the document to ${lang}. Keep structure.`,
        messages: [{ role: 'user', content: text }],
      });
      const { blobId } = await ctx.store.blobs.put(out.content, { mime: 'text/markdown', name: `${file.name}.${lang}.md` });
      await files.patch(fileId, { status: 'translated', translatedBlobId: blobId });
      ctx.publish('pdf.translated', { fileId, blobId });
      ctx.ui.notify({ key: `translate:${fileId}`, level: 'success',          // tray entry, 08 §8.11
                      title: { $t: 'notify.translated', name: file.name }, route: `/files/${fileId}` });
      return { blobId };
    },
  });

  ext.registerCommand('pdf.files.prune', {
    description: 'Delete failed imports older than 30 days.', access: 'internal',
    input: z.object({}),
    async handle(_, ctx) { /* … */ },
  });
  ext.registerSchedule('prune', { description: 'Hourly cleanup.', every: '1h', command: 'pdf.files.prune' });

  // What it answers
  ext.registerQuery('pdf.files.list', {
    description: 'List imported files, newest first.',
    input: z.object({ status: File.shape.status.optional() }),
    output: z.object({ items: z.array(File) }),
    handle: async ({ status }, ctx) => ({
      items: await ctx.store.collection('files').find({ where: status ? { status } : {}, orderBy: [['createdAt', 'desc']] }),
    }),
  });
  ext.registerQuery('pdf.files.count', {
    description: 'Count files, optionally by status.',
    input: z.object({ status: File.shape.status.optional() }), output: z.object({ count: z.number().int() }),
    handle: async ({ status }, ctx) => ({ count: await ctx.store.collection('files').count({ where: status ? { status } : {} }) }),
  });
  ext.registerQuery('pdf.file.get', {
    description: 'Get one file by id.',
    input: z.object({ fileId: z.string() }), output: File,
    handle: async ({ fileId }, ctx) => {
      const file = await ctx.store.collection('files').get(fileId);
      if (!file) throw ctx.problem('pdf/NOT_FOUND', { params: { fileId } });
      return file;
    },
  });

  // UI (08): every label is a key in the catalogs above
  ext.registerPage('pdf.files', filesPage);               // route /files (08 §8.21); goes into frame.main
  ext.registerPage('pdf.file-detail', fileDetailPage);    // route /files/:fileId
  ext.registerNavGroup('pdf.documents', { description: 'Document tools in the sidebar.', label: '$t.nav.documents', icon: 'folder' });
  ext.registerNavItem('pdf.nav-files', {                  // UI names are unique across kinds: page pdf.files, nav item pdf.nav-files
    description: 'Files page in the sidebar.', page: 'pdf.files', group: 'pdf.documents', label: '$t.nav.files', icon: 'files',
  });
  ext.registerStatusItem('pdf.queue', {                   // frame.statusbar.end, visible only while translating
    description: 'Number of translations in progress.', icon: 'loader',
    queries: { q: { query: 'pdf.files.count', payload: { status: 'translating' }, refreshOn: ['pdf.*'] } },
    visibleIf: { '$query.q.count': { gt: 0 } },
    label: { $t: 'status.translating', count: '$query.q.count' }, action: { navigate: '/files' },
  });
  ext.registerAction('pdf.translate', {                   // UI names are a separate set from message types
    description: 'Translate a PDF from its row menu.', entity: 'pdf.file', label: '$t.actions.translate', icon: 'languages',
    command: 'pdf.translate', payload: { fileId: '$item.id' }, form: true,
    visibleIf: { '$item.status': { in: ['ready', 'translated'] } },
  });
  // composite: a named view tree, rendered natively by the shell; used as { type: 'pdf.fileCard', file: … }
  ext.registerComponent('pdf.fileCard', {
    description: 'Compact card for one PDF file with its status and an Open button.',
    visibility: 'public',                                  // other extensions may use it (08 §8.9)
    props: z.object({ file: File, onOpen: z.action().optional().describe('Runs when Open is clicked') }),
    view: { type: 'card', children: [
      { type: 'heading', text: '$props.file.name' },
      { type: 'badge', text: '$props.file.status' },
      { type: 'button', label: '$t.card.open', onClick: '$props.onOpen', visibleIf: { '$props.onOpen': { exists: true } } } ] },
  });
  // widget: sandboxed iframe code for what the library cannot express
  ext.registerComponent('pdf.viewer', {
    description: 'Paged PDF viewer.', props: z.object({ blobId: z.blobId() }), widget: 'widgets/viewer.html',
  });
  ext.registerRenderer('pdf.preview', {
    description: 'Shows PDF blobs with the viewer.', target: 'mime:application/pdf',
    component: 'pdf.viewer', props: { blobId: '$item.blobId' },
  });
});
```

## 5.3 Registration API (`ext`)

One naming rule covers every method: **a public name is written in full, everywhere**: when it is registered, called, subscribed to, and used in a view (`ext.registerCommand('pdf.translate', …)`, `ctx.command('pdf.translate', …)`, `{ "command": "pdf.translate" }`). Public names are message types, entities, UI contributions, slots, renderer targets, and components; each starts with the extension's namespace and a dot (`EXT_MANIFEST_INVALID` otherwise, with a hint that shows the full name). **Private names** are plain and seen only by the extension itself: collections, logs, and schedules (`registerCollection('files')`); they match `^[a-z][a-zA-Z0-9-]*$`, and a log family may end in `:*` (`history:*`) (ADR 0016). Error codes are `<namespace>/<UPPER_SNAKE>`. Every method is `register<Kind>`, named after the kind it adds, and every definition object has a required `description`.

Name sets inside one extension:
- Message types (commands, queries, events) share one set of names: one name, one kind.
- UI names (pages, nav groups, nav items, toolbar items, status items, panels, slots, actions, renderer targets, renderers, components) share a second set: a page and a nav item cannot both be `pdf.files`. The convention for a page's nav item is `<ns>.nav-<page>`.
- Entities, collections, logs, schedules, errors, providers, and models each have their own set.
- A duplicate in any set fails validation.

`meta` (first argument of `defineExtension`): `{ name, namespace, title: Text, summary?: Text, description, icon?: string, implements?: ['agent@1'] }`. `title`, `summary`, and `icon` (a lucide name) are what people see wherever kvman names or describes the extension: notifications, settings sections, the extensions page, the grant dialog. `title` and `summary` are usually keys in the extension's own catalog. `description` is English and meant for developers, the registry, and the builder; it is shown to people only when `summary` is missing.

| Method | Registers | Result | Notes |
|---|---|---|---|
| **Permissions** | | | |
| `requestCapability(name, { reason: Text, types? })` | a capability the user must grant (§5.7) | — | `reason` (usually a `$t` key) is shown on the grant screen in the person's language; `types` (patterns) for `calls`; one call per capability name; every requested capability must be granted to enable (no partial grants) |
| `requestIsolation(mode, { reason: Text })` | `shared` or `dedicated` instead of the default (§5.7) | — | a request the user may refuse (the extension then runs `sandboxed`); built-in extensions run `shared`; needed for native addons (`06` §6.2) |
| `requireTypes(types, { reason: Text })` | message types that enabled extensions must provide | — | checked at enable and preset apply |
| `requireComponents(names, { reason: Text })` | public components of other extensions that its views use | — | checked at enable and preset apply; the owner cannot be disabled while required (`08` §8.9) |
| **Handlers** | | | |
| `registerCommand(name, CommandDef)` | a command (§5.5) | `pdf.translate` | exactly one handler; `access` says who may call it (`02` §2.4); may be an agent tool or a slash command |
| `registerQuery(name, QueryDef)` | a read-only query | `pdf.files.list` | never queued; read-only store; `access` like commands; may be an agent tool |
| `registerEvent(name, EventDef)` | an event type this extension publishes, with its delivery class (`02` §2.5) | `pdf.translated`, `pdf.progress.updated` | `EventDef = { description, delivery?: 'durable' (default) \| 'transient' \| 'live', payload?: ZodType, chunk?: 'text' \| 'value' \| 'data', namingException?: string }`: `payload` for durable and transient events; `chunk` (the `LiveChunk` shape, `02` §2.3) for live events. Only registered events can be published |
| `subscribe(eventType, SubscriptionDef)` | a handler for a durable or transient event (own, `kernel.*`, or another extension's) | `subscription:<eventType>` | wildcards allowed (`pdf.*`; they never match live events); foreign events need a grant (§5.7); subscribing to a live event fails validation (`EXT_MANIFEST_INVALID` when recording for its own, when building the registry for another's, ADR 0068) |
| `registerSchedule(name, { description, every \| cron, command, payload? })` | a timer that sends one of its own commands | `prune` (private) | the command is usually `internal`; it must be one of its own commands with access other than `user`, `payload` (default `{}`) must match its input, and `cron` is five fields in local time; one run per enabled workspace, or one without a workspace for a global command (`03` §3.4, ADR 0144) |
| `registerPrompt(name, PromptDef)` | a question or approval a person answers (§5.5) | `interviewer.question` | registers the prompt's collection, list query, `answer` / `reject` (access `user`) and `expire` (internal) commands, and `asked` / `closed` events; returns a handle whose `open(ctx, data)` stores the prompt and defers the reply |
| `registerError(code, { description, title, retryable?, hint? })` | an error its handlers throw with `ctx.problem` (§5.4) | `pdf/NOT_FOUND` | `title` and `hint` are the English fallback; people see `problems.<CODE>` from its catalog (`08` §8.16); listed in `/schema` |
| **Data** | | | |
| `registerDataVersion(version, { migrations?, compatibleWith? })` | the data schema version and its migrations (`04` §4.8) | — | at most once; without it the version is 1; `compatibleWith` lists higher data versions this code still runs on (ADR 0142); a migration's `up(m)` uses `m.kv`, `m.collection(name)`, and `m.log(name)` `.each(fn)` and `m.config` (ADR 0143) |
| `registerCollection(name, { description, schema, idField?, indexes? })` | a document collection | `files` (private) | `idField` defaults to `'id'`; `04` §4.3 |
| `registerLog(prefix, { description, entry })` | an append-only log family | `history:*` (private) | |
| `registerEntity(name, { description, title: Text, schema, idField, display, route? })` | a typed record the UI can show and attach actions to (§5.6) | `pdf.file` | `display` = `{ title, subtitle?, icon? }` with `$item` bindings over one record; `route` = the page that shows one record, e.g. `'/files/{{ $item.id }}'` (used to open the entity from notifications and the palette; must match an owned page's route) |
| `registerConfig({ scope, schema })` | its settings; `.meta({ secret: true })` fields go to secrets (§5.8) | — | once; a settings form is generated from it |
| **UI** (`08`; shapes in `08` §8.5) | | | |
| `registerPage(name, PageDef)` | a page (kind `page`, placed in `frame.main` by route) | `pdf.files` | `PageDef` is JSON; it can live in a `.json` file |
| `registerNavGroup(name, NavGroupDef)` | a group in the sidebar (kind `navGroup`, `frame.sidebar`) | `pdf.documents` | |
| `registerNavItem(name, NavItemDef)` | a sidebar item for a page (kind `navItem`, `frame.sidebar`) | `pdf.nav-files` | optional `group`, `badge` |
| `registerToolbarItem(name, ToolbarItemDef)` | a button, menu, or badge (kind `toolbarItem`) in `frame.topbar.start/end` or an extension slot that accepts it | `pdf.upload` | |
| `registerStatusItem(name, StatusItemDef)` | a status bar item (kind `statusItem`, `frame.statusbar.start/end`) | `pdf.queue` | usually with `visibleIf` |
| `registerPanel(name, PanelDef)` | a panel (kind `panel`) in `frame.overlay` or an extension slot that accepts it | `interviewer.question` | runtime UI: visible when its query says so (`08` §8.10) |
| `registerSlot(name, SlotDef)` | a slot its own pages place for others to fill | `agent.chat.prompt` | `accepts: ['panel' \| 'toolbarItem']`, `props` = the `$slot` values it passes |
| `registerAction(name, ActionDef)` | an action on an entity type (any extension's) | `pdf.translate` | |
| `registerRendererTarget(name, { description, item })` | a renderer target its pages declare | `agent.entry` | |
| `registerRenderer(name, RendererDef)` | a renderer for a target, entity, or MIME type | `pdf.preview` | |
| `registerComponent(name, CompositeDef \| WidgetDef)` | a composite or widget component | `pdf.fileCard` | `visibility: 'private'` (default) or `'public'`; `08` §8.9, §8.15 |
| `registerSettingsSection({ description, view })` | a custom view (a `ViewNode`) for its settings section, replacing the generated form | — | optional, once, and only with `registerConfig` (ADR 0160); the section id stays `settings.section.<ns>` (`08` §8.4) |
| `registerTranslations({ default, catalogs })` | translation catalogs, one per language (ICU MessageFormat) | — | once; keys are namespaced automatically (`08` §8.16) |
| **LLM** (§5.11) | | | |
| `registerProvider(id, ProviderDef)` | an LLM provider implementation | `anthropic` | provider IDs are global names shown to users |
| `registerModel(id, ModelDef)` | a model of one of its providers | `anthropic/claude-sonnet-5` | dynamic lists come from `ProviderDef.listModels` |

Every `register*` call returns a typed reference that can be passed instead of the name (`ctx.store.collection(files)`, `ctx.publish(translated, …)`), so payloads are type-checked. A reference is the registered name itself with a type-only brand (ADR 0044).

**Registration mistakes** are collected: the recorder builds the whole manifest, checks it (manifest schema, namespace of public names and error codes, name sets, migration steps, schemas that cannot become JSON Schema), and fails once with `EXT_MANIFEST_INVALID` listing every issue at its manifest path with a hint. A `setup` that returns a promise or throws fails the same way; calling `ext` after `setup` returns throws `EXT_MANIFEST_INVALID` at once (ADR 0042). Names work everywhere too. Other extensions' types are typed through `kvman ext types` (`12` §12.5), which writes declarations for every message type in a workspace.

**Schema helpers** (`z` from `@kvman/sdk` is Zod 4 plus the helpers below; the SDK depends on `zod` at the exact version protocol uses, ADR 0043):

| Helper | Meaning |
|---|---|
| `z.blobId()` | a blob ID field (lowercase SHA-256 hex; JSON Schema `{ type: 'string', format: 'kvman-blob-id', pattern: '^[0-9a-f]{64}$' }`, ADR 0018); handing it over grants read access to that blob (`04` §4.6) |
| `z.text()` | a user-facing `Text` prop: a literal, a `$t` key, or a key with parameters (`08` §8.5); JSON Schema: the `Text` schema with `format: 'kvman-text'` (ADR 0023) |
| `z.action()` | an event prop of a composite component: the using view passes an `Action` (`08` §8.9); JSON Schema: the `Action` schema with `format: 'kvman-action'` (ADR 0023) |

Field labels for generated forms come from `.meta({ label, help })`, each a `Text` (`08` §8.12).

## 5.4 Handler context (`ctx`)

```ts
interface Ctx {
  message: Message;                 // current message (readonly)
  context: Readonly<Record<string, string>>;   // the inherited context (02 §2.10), e.g. ctx.context.sessionId
  workspace?: { id: string; path: string; name: string };   // absent for global-scope types
  signal: AbortSignal; deadlineAt: number;
  now(): number; ids: { new(): string };        // deterministic per invocation for replay safety
  locale: string;                   // the user's language for this message (BCP 47); always set, from message context (02 §2.10)
  i18n: { t(key: string, params?: Record<string, Json>): string };   // own catalog in ctx.locale, for text leaving kvman;
                                    // a missing key or parameter throws VALIDATION_FAILED (ADR 0161)

  // messaging
  command<T>(type, payload, opts?: { lane?, priority?, deadlineAt?, context?, idempotencyKey? }): Promise<T>;
                                                   // run a command and wait for its result: immediate, journaled,
                                                   // deadline-bounded
  send(type, payload, opts?: { lane?, delayMs?, at?, priority?, deadlineAt?, onReply?, context?, idempotencyKey? }): void;
                                                   // start a command without waiting (in UoW); idempotencyKey dedupes
                                                   // across invocations (02 §2.7)
  query<T>(type, payload): Promise<T>;
  publish(type, payload): void;                    // in UoW; own registered durable or transient events
  live(type, key: string, chunk: LiveChunk): void; // immediate; own registered live events only; not in queries;
                                                   // the kernel adds run = ctx.message.id (02 §2.3, §2.5)
  defer(opts?: { onAbort?: string }): Deferred;    // return from a command handler; onAbort = own internal command
  reply(commandId, value | Problem): void;         // complete a deferred command (in UoW); REPLY_NOT_AWAITING if it ended
  problem(code, opts?: { params?, detail? }): ProblemError;
                                                   // code: one registered with ext.registerError; its title, hint, and
                                                   // retryable come from there; the shell shows <ns>:problems.<CODE>

  // LLM (capability 'llm', §5.11)
  llm: {
    complete(req: LlmRequest): Promise<LlmResult>;  // journaled like ctx.command
    countTokens(req: LlmRequest): Promise<number>;
    models(): Promise<ModelInfo[]>;                 // models available in this workspace; needs no `llm` (ADR 0155)
  };

  // notifications (capability 'ui', 08 §8.11): shorthands for ctx.send('ui.toast' | 'ui.notify' | 'ui.dismiss' | 'ui.navigate', …)
  ui: { toast(t: Toast): void; notify(n: Notification): void; dismiss(key: string): void; navigate(route: string): void };

  // effects
  step<T>(name, fn: () => Promise<T>, opts?: { retrySafe?: boolean }): Promise<T>;
  process: {                                                               // capability 'process'; detached + onExit, 03 §3.7, ADR 0139
    spawn(opts: SpawnOptions): Promise<ProcessHandle>;                     // { processId, wait(): Promise<ProcessResult>, kill() }
    kill(processId: string): Promise<void>;                                // any live process the extension owns
  };
  files: {                                                                 // capabilities files.read / files.write (07 §7.2, ADR 0136)
    read(path): Promise<string>;                                           // UTF-8, ≤ 16 MB; paths relative to the workspace root
    write(path, content: string | Uint8Array): Promise<void>;             // creates or replaces, creates parents; ≤ 16 MB
    list(path?): Promise<Array<{ name, kind: 'file' | 'directory' | 'symlink' | 'other', size }>>;  // by name
    stat(path): Promise<{ kind, size, modifiedAt } | undefined>;
    mkdir(path): Promise<void>;                                            // recursive; no error if it exists
    rm(path, opts?: { recursive? }): Promise<void>;                       // no error if missing
    glob(pattern): Promise<string[]>;                                      // Node fs.glob syntax, sorted, ≤ 5,000 matches
  };
  http?: { fetch }                                                         // capability 'network'

  // data
  store: Store;                                    // 04 §4.3: kv, collection(), log(), blobs, global; read-only in queries
  config: { get(): Promise<Config>; set(scope, value): void };
  secrets: { get(name): Promise<string | undefined>; set(name, value): void };   // set: applied after commit (04 §4.7)
  log: Logger;                                     // debug|info|warn|error(message, fields?): structured, redacted,
                                                   // correlation attached (ADR 0073)
}
```

- `send`, `publish`, `reply`, `ui.*`, store writes, `blobs.keep`, `config.set`, and `secrets.set` are buffered in the unit of work, so a notification is shown only if the handler commits.
- `command`, `query`, `llm.*`, `live`, `step`, `process`, `files`, and `blobs.put` happen immediately. Live events from an attempt that does not commit are reset by the kernel (`02` §2.3).
- The SDK's `Ctx` type declares each member once the milestone that builds it is done (ADR 0050).
- `ctx.ids.new()` and `ctx.now()` are recorded per invocation so a redelivered handler generates the same IDs and times for the same steps: values are numbered per message and stored with the next journaled write (a step begin, a `ctx.command` send, or a failed attempt's end); a redelivery replays them in order (ADR 0070).
- `ctx.command`'s derived key uses the call's 1-based ordinal among the invocation's `ctx.command` calls (`<id>:command:1`); an explicit `idempotencyKey` replaces it. It resolves with the reply's value and rejects with a `ProblemError` carrying the reply's problem (ADR 0072).
- Misuse codes (ADR 0074): in a query, `send`, `publish`, `command`, `live`, `defer`, `reply`, and `step` throw `CAPABILITY_DENIED` (`query` is allowed); `live` of anything but an own live event is `CAPABILITY_DENIED`, a chunk of the wrong shape `VALIDATION_FAILED`; `defer` outside a command handler, or an `onAbort` that is not an own internal command, is `VALIDATION_FAILED`; at commit, `reply` to another extension's command is `CAPABILITY_DENIED` and to one that is not `awaiting` is `REPLY_NOT_AWAITING`. A thrown `ProblemError` passes through; anything else thrown is `INTERNAL`. `ctx.problem` with an unregistered code of its namespace is delivered with `title` = code and `retryable: false`, and logged as a warning.
- `ctx.workspace` comes from the `workspaces` row; a message whose workspace has no row fails `WORKSPACE_INVALID` (ADR 0075).

## 5.5 Handler definitions

```ts
type CommandDef = {
  description: string; input: ZodType; output?: ZodType; examples?: Json[];
  lane?: string;                                // lane template (02 §2.6), e.g. 'file:{{ $payload.fileId }}'
  concurrency?: number; timeoutMs?: number; maxAttempts?: number;
  priority?: 'interactive' | 'normal' | 'background';   // used when the sender requests none; capped like a request (ADR 0065)
  retention?: string;                           // a duration: '30s', '1h', '7d' (ADR 0016)
  namingException?: string;                     // reason for a name outside the grammar (02 §2.4, ADR 0016)
  scope?: 'workspace' | 'global';
  access?: 'all' | 'user' | 'extensions' | 'internal';   // who may call it (02 §2.4); default 'all'
  slash?: { name: string; description: Text; arg?: string };   // composer slash command (09 §9.11); access 'all' or 'user' only
  agentTool?: AgentToolDef & {
                waitMs?: number;                 // how long the agent waits for the result (default: until the turn deadline)
                dangerous?: boolean;             // with no guard covering it, the agent asks the person first
                interactive?: boolean };         // it waits for a person (the agent shows the session as "Waiting")
  handle(input, ctx): Promise<Output | Deferred>;
};
type AgentToolDef    = { title: string; description?: string; resultLimit?: number;
                         hiddenFields?: string[] };  // input fields the agent fills itself; never shown to the model
type QueryDef        = { description; input; output; examples?; timeoutMs?; namingException?: string;
                         access?: 'all' | 'user' | 'extensions' | 'internal';   // default 'all'
                         agentTool?: AgentToolDef;                              // a read-only tool (09 §9.5)
                         handle(input, ctx): Promise<Output> };
type SubscriptionDef = { description; lane?: string /* template over the event: $payload, $context, $message */; concurrency?; timeoutMs?;
                         handle(payload, ctx): Promise<void> };
```

- `access` (`02` §2.4): `all` people and extensions (default), `user` only people, `extensions` only extensions and their processes, `internal` only this extension and the kernel.
- `agentTool` makes a command or a query an agent tool. A tool that only reads is a query; a tool that changes something is a command. It must have access `all` or `extensions` (the agent calls tools).
- `slash` is allowed only with access `all` or `user`. `name` is the word typed after `/` (lowercase, kebab-case). `arg` names one string field of the input that receives the text typed after the name. The composer fills `workspaceId` from the tab and the fields named in its `slash.fill` (the agent's composer fills `sessionId`, `08` §8.8); if other required fields remain, it opens the generated form (`08` §8.12), else it sends at once.
- `internal` types are hidden from `/schema` (for every caller, ADR 0111), the UI, `kv help`, and the agent's tool list.
- An `access: 'user'` command can be triggered from declarative views (actions, forms, buttons) but never from a widget: the widget bridge sends as the extension (`08` §8.15). An `access: 'extensions'` command can be sent from a widget or a handler, never from a declarative view.
- One `subscribe` per event type (or pattern) per extension. A subscription with a `lane` runs in that lane, like a command.

### Asking a person (the prompt pattern)

There is no kernel prompt primitive. An extension that needs an answer from a person uses its own storage, UI, and a user-only command (`02` §2.8, `08` §8.13). `ext.registerPrompt(name, PromptDef)` registers the pieces in one call, so authors and the builder do not rewrite them:

```ts
import { defineExtension, z } from '@kvman/sdk';

export default defineExtension({
  name: '@kvman/interviewer', namespace: 'interviewer',
  description: 'Lets the agent ask the person a question and wait for the answer.',
}, (ext) => {
  const questions = ext.registerPrompt('interviewer.question', {   // → interviewer.question.* types
    description: 'A question from the agent to the person.',
    data: z.object({ sessionId: z.string(), question: z.string(), choices: z.array(z.string()).optional() }),
    answer: z.object({ answer: z.string() }),
    oneOpenPer: (d) => `session:${d.sessionId}`,               // optional: at most one open prompt per value
  });
  // registered: collection questions, query interviewer.questions.list, commands interviewer.question.answer and
  // interviewer.question.reject (access: 'user'), interviewer.question.expire (access: 'internal', the onAbort),
  // events interviewer.question.asked / .closed

  ext.registerCommand('interviewer.ask', {
    description: 'Ask the person a question and wait for the answer.', /* input, agentTool … */
    async handle(input, ctx) {
      return questions.open(ctx, { sessionId: ctx.context.sessionId, question: input.question });
    },                              // stores the prompt, publishes question.asked, returns ctx.defer({ onAbort })
  });
  ext.registerPanel('interviewer.prompt', { description: 'Open question above the composer.',
                                slot: 'agent.chat.prompt', /* view bound to interviewer.questions.list */ });
});
```

Everything `registerPrompt` registers is in the manifest and `/schema` like hand-written registrations (the manifest has no prompt section of its own). The extension still owns the UI: `registerPrompt` provides data and commands, not views. A second `open` while a prompt with the same `oneOpenPer` value is open fails `<ns>/BUSY`, an error `registerPrompt` registers for the extension.

## 5.6 Entities and actions

- An **entity** is a typed record the extension exposes (`pdf.file`, `agent.session`), registered with `ext.registerEntity`. It declares a schema, an id field, and display hints.
- **Actions** (`ext.registerAction`) attach a command to an entity type. Any extension may add actions to any entity type; this is how extensions compose in the UI (an `ocr` extension adds "Extract text" to `pdf.file` rows). The action's command must be the extension's own or covered by its granted `calls` (§5.7).
- Entities are also the input to renderers and widgets, and they describe data to the builder.

## 5.7 Capabilities

Capabilities come from two places: **requested** with `ext.requestCapability` (for things handlers do at runtime), and **derived** from registrations (for things the manifest already shows). Both are listed on the grant screen in plain words (from the kvman catalog), with the extension's `reason` in the person's language. Grants are all or nothing: an extension is enabled with every requested capability or not at all.

| Capability | How it is requested | Grants | Enforced |
|---|---|---|---|
| (always) | — | own storage, config, secrets, and namespace messages; publishing its registered events; subscribing to its own and `kernel.*` events; `kernel.*` queries marked "any" and `kernel.cancel` for its own messages (`03` §3.8); blobs it holds a ref to or received in a `z.blobId()` field (`04` §4.6) | kernel |
| `calls` | `requestCapability('calls', { types: [patterns] })` | calling foreign commands and queries (`ctx.command`, `ctx.send`, `ctx.query`: `fs.file.get`, `todo.*`), including from its views and actions. Patterns are exact types or `<prefix>.*`; `*` alone is not allowed. Foreign `internal` and `user` types are never covered by a pattern (a view's click may send a foreign `access: 'user'` command only when `calls` names it exactly) | kernel, at `ctx` call, at commit, and at view validation |
| `tools` | `requestCapability('tools', { reason })` | calling every command and query flagged `agentTool` that is enabled in the invocation's workspace and not turned off by any `extensions[*].disable` of its applied preset (`09` §9.5); a global invocation has no tool set and needs `calls` (ADR 0133). Meant for agents; shown as "can run every agent tool enabled in this workspace" | kernel, per message, against the workspace's current tool set |
| `subscribes` | derived from each `ext.subscribe` of a foreign event | receiving those events | kernel (no inbox row without the grant) |
| `provides-llm` | derived from `ext.registerProvider` | serving LLM calls; the provider receives the prompts sent to its models | kernel |
| `llm` | `requestCapability('llm')` | `ctx.llm.complete` and `ctx.llm.countTokens` (§5.11; `ctx.llm.models()` is open like `kernel.llm.models.list`, ADR 0155) | kernel |
| `ui` | `requestCapability('ui')` | sending the one-way `ui.toast`, `ui.notify`, `ui.dismiss`, `ui.navigate` (`08` §8.11); their action buttons are checked like view actions | kernel |
| `files.read` / `files.write` | `requestCapability(…)` | `ctx.files` inside the workspace (never `~/.kvman`) | kernel + trust gate |
| `process` | `requestCapability('process')` | `ctx.process.spawn` | kernel; OS permission for sandboxed |
| `network` | `requestCapability('network')` | outbound network (`ctx.http`, and raw sockets in non-sandboxed hosts) | declared and disclosed; not enforced on Node 24; enforced automatically for `sandboxed` hosts when the running Node supports network permissions (R-Q2) |
| `kernel.admin` | `requestCapability('kernel.admin')` | mutating `kernel.*` commands and admin-only kernel queries | kernel |

A grant has one shape everywhere (presets, `kernel.extension.enable`, `kernel.extension.reload`, `kernel.extension.get`), defined in `@kvman/protocol`:

```ts
type Capabilities = {
  isolation: 'shared' | 'dedicated' | 'sandboxed';
  requested: Array<
    | { name: 'calls'; types: string[] }                 // the patterns of requestCapability('calls', { types })
    | { name: 'tools' | 'llm' | 'ui' | 'files.read' | 'files.write' | 'process' | 'network' | 'kernel.admin' }>;
  derived: {
    subscribes: string[];                                // foreign event types and patterns it subscribes to
    providesLlm: string[];                               // provider ids it registers
  };
};
```

A grant is valid only when `requested` and `derived` equal exactly what the manifest requests and derives (all or nothing, above), and `isolation` is the level the manifest requested with `requestIsolation` or any higher one, in the order `shared` < `dedicated` < `sandboxed` (`sandboxed` only, when it requested none; built-in extensions: `shared`; ADR 0128). Anything else fails `CAPABILITY_DENIED`, listing the differences.

**Isolation is part of the grant.** Built-in extensions run `shared`. Every other extension runs `sandboxed` (its own process under Node's permission model) unless it calls `ext.requestIsolation('shared' | 'dedicated', { reason })` **and** the user approves the lower isolation on the grant screen, which warns that such code has full access to this computer. The user may always raise isolation later.

A preset records the **granted** set per extension, isolation included; an extension whose requested capability is not granted cannot be enabled. For `shared` and `dedicated` extensions, raw Node APIs are not blocked (trusted code); the kernel enforces everything that goes through `ctx`. For `sandboxed` extensions the process runs with Node's permission model so raw file, child-process, worker, and native-addon access fails at the runtime level, and with `node:sqlite` turned off (`03` §3.5), because the permission model does not cover it. No grant widens these flags: files, processes, and the network are reached only through `ctx`, and a handler the permission model blocks fails `CAPABILITY_DENIED` (ADR 0129); network access is restricted only when the Node version supports it (R-Q2), and the UI says which level applies.

## 5.8 Config and secrets

- `ext.registerConfig({ scope, schema })`: a Zod schema with `.describe()` on every field (for developers and LLMs), `.meta({ label, help })` for the translated form label (`08` §8.12), and optional `.meta({ ui: { widget, group, order } })` for form hints. `scope` is `global`, `workspace`, or `both`.
- Fields marked `.meta({ secret: true })` are stored in the secrets store.
- `ctx.config.get()` returns the merged typed value: schema defaults < global < workspace, by top-level field, with the handler's own pending `ctx.config.set` applied and without secret fields (ADR 0125). `ctx.secrets.get(name)` reads a secret (its own pending set first); names match `^[A-Za-z0-9._-]{1,128}$` and values are strings up to 64 KB (ADR 0126).
- A `kernel.config.changed` event is published after every change.

## 5.9 Rules for handler code

1. Put all persistent state in `ctx.store`. No module-level state that changes results.
2. Wrap every external side effect (HTTP call, file outside the workspace API, third-party API) in `ctx.step`, or use `ctx.process`. `ctx.llm.complete` is already journaled.
3. Keep handlers short; for long waits use continuations or deferred replies.
4. Declare a `lane` whenever ordering matters. Declare no lane for control messages.
5. Register every error your handlers throw (`ext.registerError`) and throw it with `ctx.problem(code, { params })`; mark it `retryable` only when retrying can succeed.
6. Never log payloads or secrets; the logger redacts known secret fields but code should not rely on it.
7. Keep `setup` to `ext` calls and plain constants (§5.1); put anything that needs data or I/O in a handler.
8. Never build text for people in handlers. Send keys with parameters (`{ $t: 'toast.translated', name }`) and let the shell render them; use `ctx.i18n.t` only for text that leaves kvman (files, LLM prompts, other systems).

## 5.10 Testkit (`@kvman/testkit`)

```ts
import { createTestKernel, fakeProvider } from '@kvman/testkit';
import pdf from '../src/extension';

const k = await createTestKernel({ extensions: [pdf, fakeProvider({ reply: 'مرحبا' })], workspace: 'tmp' });
const { blobId } = await k.blobs.put(samplePdf, { mime: 'application/pdf' });
const { fileId } = await k.asUser().command('pdf.import', { blobId });
await k.command('pdf.translate', { fileId, lang: 'ar' });
expect(await k.query('pdf.files.list', {})).toMatchObject({ items: [{ status: 'translated' }] });
expect(k.events('pdf.translated')).toHaveLength(1);
await k.crashDuring('pdf.translate', 'after-step:extract');   // fault injection
```

The testkit runs the real kernel with in-memory SQLite and a synchronous host, plus a fake LLM provider (`fakeProvider`, registered through the normal provider API; its options are in ADR 0154), fake processes, and a recorder for `ui.*`. It also runs `setup` twice to prove it is deterministic, fails a test whose handler throws an error code the extension did not register, and checks the extension's catalogs (every key its views use exists in the default catalog, every message is valid ICU). `k.asUser({ locale: 'ar' })` sends with a given language so `ctx.locale` and `ctx.i18n.t` can be tested. Prompts are answered the way a person would: `k.asUser().command('interviewer.question.answer', { questionId, answer })`; `k.command(...)` sends as a test extension, so the testkit also proves that `access: 'user'` commands reject non-user sources and `access: 'extensions'` commands reject people. The same tests run against `sandboxed` isolation in CI. `createTestKernel` also has a **remote mode**, used by builder projects (`11` §11.5): inside a sandboxed test process it is a client, over IPC, of a test kernel that the build runs, with the same API; the project's own extension is always the one loaded from its `dist/`, and fakes such as `fakeProvider(...)` are passed as data.

## 5.11 LLM access and providers

LLM access is a kernel service (D49). The kernel owns the **provider and model registry**, model defaults, the call path, streaming relay, retries, and usage accounting. It contains no provider SDK: **providers are implemented by extensions** that register them (the core one is `llm-providers`, `10` §10.1). Any extension with the `llm` capability calls models through `ctx.llm`.

### Calling a model

```ts
type ModelRef = { provider: string; id: string };
type LlmRequest = {
  purpose: 'chat' | 'summary' | 'extension' | 'child';
  model?: ModelRef;                    // default: the workspace default for this purpose (kernel.llm.defaults)
  system?: string;
  messages: LlmMessage[];              // user / assistant / tool messages; images as z.blobId() parts
  tools?: Array<{ name: string; description: string; input: JsonSchema }>;
  thinking?: 'off' | 'low' | 'medium' | 'high';
  maxTokens?: number;
  live?: {                             // `<type>:<key>` of the caller's own live events (chunk 'text') to relay deltas to
    text?: string;                     // the answer text, e.g. `agent.tokens.generated:<sessionId>`
    thinking?: string;                 // the thinking text, e.g. `agent.thinking.generated:<sessionId>`
  };
};
type LlmResult = {
  content: string; thinking?: string; toolCalls?: ToolCall[];
  usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  costUsd?: number; model: ModelRef; stopReason: 'end' | 'tool-calls' | 'max-tokens';
};
type ToolCall = { id: string; name: string; args: JsonObject };                      // ADR 0014
type LlmContentPart = { type: 'text'; text: string } | { type: 'image'; blobId: string; mime: string };
type LlmMessage =
  | { role: 'user'; content: string | LlmContentPart[] }
  | { role: 'assistant'; content: string; thinking?: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string; isError?: boolean };
```

- `ctx.llm.complete(req)` is `ctx.command('kernel.llm.complete', req)`: journaled, so a redelivered handler gets the recorded result instead of a second call; bounded by the caller's deadline; cancelled with it.
- The kernel resolves the model (explicit → workspace default for the purpose → global default), checks that its provider is enabled in the workspace and configured, then invokes the provider's `complete` function in the provider's host. The provider's text deltas are published by the kernel as `{ text }` chunks of the caller's live event `req.live.text`, and its thinking deltas on `req.live.thinking`; each is skipped when not set. The kernel checks at admission that both name live events registered by the caller with chunk `text` (`VALIDATION_FAILED` otherwise).
- Retryable failures (`LLM_CALL_FAILED`) are retried by the kernel with backoff, honoring the provider's `retryAfterMs`. `thinking` on a model that does not support it fails `LLM_THINKING_UNSUPPORTED`; it is never silently dropped.
- Every call records usage (workspace, calling extension, provider, model, tokens, cost, `correlationId`), readable with `kernel.llm.usage.get`. Cost comes from the provider or from the model's registered prices.
- The request and result schemas live in `@kvman/protocol`, so every provider speaks the same format.

### Registering a provider and its models

```ts
ext.registerProvider('anthropic', {
  title: 'Anthropic',
  description: 'Claude models through the Anthropic API.',
  auth: 'api-key',                                   // 'api-key' | 'oauth' | 'none' (an OAuth login is the extension's own
                                                     // command, shown in its panel in the settings.providers slot)
  status: async (ctx) => ({ configured: Boolean(await ctx.secrets.get('anthropic.apiKey')) }),
  listModels: async (ctx) => [/* ModelDef[] */],     // optional: models discovered at runtime
  countTokens: async (req, ctx) => 0,                // optional: exact tokenizer
  async complete(req, ctx) {                         // ctx.delta() is relayed to the caller's live event
    for await (const d of callApi(req, ctx.signal)) ctx.delta({ text: d.text, thinking: d.thinking });
    return result;                                   // LlmResult
  },
});

ext.registerModel('claude-sonnet-5', {
  provider: 'anthropic', title: 'Claude Sonnet 5', description: 'Balanced model for coding and chat.',
  contextWindow: 200_000, maxOutput: 64_000,
  cost: { inputPerMTok: 3, outputPerMTok: 15 },
  capabilities: { tools: true, vision: true, thinking: ['low', 'medium', 'high'] },
});
```

- Provider IDs are global names (`anthropic`, `ollama`). Two enabled extensions registering the same provider ID fail to enable together (`PROVIDER_CONFLICT`).
- `ModelDef.cost` is optional (a local model has no price); provider and model titles are `Text` (ADR 0014).
- Models come from `registerModel` (static) and from `listModels` (dynamic, e.g. a local Ollama server or an OpenAI-compatible endpoint). The kernel stores the combined list in its `llm_models` table and refreshes it at enable, on provider config change, and on `kernel.llm.models.refresh`. It publishes `kernel.llm.models.changed`.
- Credentials are the provider extension's own config and secrets (`ext.registerConfig`), so they appear in its settings section; `status` tells the Models page whether it is ready.
- Providers report failures with the kernel's LLM codes through the SDK helper `llmProblem(code, detail, { retryAfterMs })`, so callers see the same errors whatever the provider.
- Provider functions get a read-only `ProviderContext` (`workspace`, `signal`, `config.get`, `secrets.get`, `log`; `complete` also `delta`), never a handler `ctx` (ADR 0153).
- Registering a provider derives the `provides-llm` capability (§5.7), so the user sees that this extension will receive prompts.

## 5.12 The manifest

The **manifest** is the static record of everything `setup` registered. The kernel builds it at install by running `setup` with a recording `ext` in the sandboxed loader (§5.1), converting schemas with the `@kvman/protocol` helper around Zod 4's `z.toJSONSchema` (default options, ADR 0047), validates it (`06` §6.3), and stores it as `snapshots/<digest>/manifest.json` and in `extension_versions.manifest`. Everything the kernel does with an extension (routing, validation, grants, the UI registry, the schema endpoint, the agent's tool list and guard detection, the LLM registry) reads the manifest, never live code. (The list of package files and hashes behind the digest is a different thing, the **file list**, `files.json`.)

### Shape

`Manifest` is a Zod schema in `@kvman/protocol`. One section per group of `ext` calls in §5.3; each entry mirrors its call's arguments, with every Zod schema stored as JSON Schema (draft 2020-12) and every function stored as a reference.

```jsonc
{
  "manifestVersion": 1,
  "meta": { "name": "@acme/pdf", "version": "1.2.0", "namespace": "pdf", "title": "$t.meta.title", "summary": "$t.meta.summary",
            "icon": "file-text", "description": "Import PDF files and translate them with the configured AI model.",
            "implements": [] },
  "permissions": {
    "capabilities": [ { "name": "llm", "reason": "$t.reasons.llm" },
                      { "name": "ui",  "reason": "$t.reasons.ui" } ],
                                           // calls: { "name": "calls", "types": ["fs.file.get"], "reason": "$t.reasons.calls" }
    "isolation": null,                     // or { "mode": "shared" | "dedicated", "reason": "…" }
    "requireTypes": [], "requireComponents": []
  },
  "types": [
    { "type": "pdf.import", "kind": "command", "description": "Import an uploaded PDF blob.",
      "input": { /* JSON Schema */ }, "output": { /* JSON Schema */ }, "examples": [ { "blobId": "sha256…" } ],
      "lane": "blob:{{ $payload.blobId }}", "access": "all", "handler": "command:pdf.import" },
    { "type": "pdf.translate", "kind": "command", "description": "Translate a PDF to a target language.",
      "input": { … }, "output": { … }, "lane": "file:{{ $payload.fileId }}", "access": "all",
      "concurrency": 2, "timeoutMs": 300000, "agentTool": { "title": "Translate PDF" }, "handler": "command:pdf.translate" },
    { "type": "pdf.files.prune", "kind": "command", "access": "internal", "input": { … }, "handler": "command:pdf.files.prune" },
    { "type": "pdf.files.list", "kind": "query", "input": { … }, "output": { … }, "access": "all",
      "handler": "query:pdf.files.list" },
    { "type": "pdf.imported", "kind": "event", "delivery": "durable", "payload": { … } },
    { "type": "pdf.translated", "kind": "event", "delivery": "durable", "payload": { … } },
    { "type": "pdf.progress.updated", "kind": "event", "delivery": "live", "chunk": "text" }
  ],
  "subscriptions": [],                     // [{ "event": "agent.session.deleted", "lane"?: "…", "concurrency"?, "timeoutMs"?,
                                           //    "description": "…", "handler": "subscription:agent.session.deleted" }]
  "schedules": [ { "name": "prune", "description": "Hourly cleanup.", "every": "1h", "command": "pdf.files.prune" } ],
  "data": {
    "version": 1, "compatibleWith": [],       // registerDataVersion (1 when not called)
    "migrations": [],                      // [{ "to": 2, "handler": "migration:2" }]
    "collections": [ { "name": "files", "description": "Imported PDF files.", "schema": { … }, "idField": "id",
                       "indexes": [["status", "createdAt"]] } ],
    "logs": []                             // [{ "prefix": "history:*", "description": "…", "entry": { … } }]
  },
  "entities": [ { "name": "pdf.file", "description": "An imported PDF file.", "title": "$t.entities.file",
                  "schema": { … }, "idField": "id", "display": { "title": "$item.name", "subtitle": "$item.status" } } ],
  "config": { "scope": "workspace", "schema": { … } },     // null when registerConfig is not called
  "errors": [ { "code": "pdf/NOT_FOUND", "description": "…", "title": "No such file", "retryable": false } ],
  "ui": { "pages": [ … ], "navGroups": [ … ], "navItems": [ … ], "toolbarItems": [], "statusItems": [ … ],
          "panels": [], "slots": [], "actions": [ … ], "rendererTargets": [], "renderers": [ … ],
          "components": [ … ], "settingsSection": null },      // each entry: its id, description, and definition (08 §8.5)
  "translations": { "default": "en", "catalogs": { "en": { … }, "ar": { … } } },
  "llm": { "providers": [], "models": [] }  // providers: { id, title, description, auth,
                                            //   functions: ["provider:<id>.complete", "…status", "…listModels"?, "…countTokens"?] }
}
```

### Rules

- **Recording** (ADR 0013): a UI entry is `{ "id": "<ns>.<name>", ...definition }` (the definition's own fields, its `description` included); `config`, `translations`, `ui.settingsSection`, and `permissions.isolation` are `null` when their call is never made, and every list section is `[]` when empty; `requireTypes` entries are `{ types, reason }` and `requireComponents` entries `{ components, reason }`, one per call; defaults are written explicitly (`access: "all"`, an error's `retryable: false`, `idField: "id"`, an event's `delivery: "durable"`, `data.version: 1`, `data.compatibleWith: []`), and every other optional field is left out when not given.
- **Function references** name what registered the function: `command:<type>`, `query:<type>`, `subscription:<event type>`, `migration:<to>`, `provider:<id>.<complete | status | listModels | countTokens>`. A host binds each reference when it runs `setup` at load; a reference without a bound function, or a bound function without a reference, is manifest drift (`EXT_MANIFEST_INVALID`, quarantine, `03` §3.6).
- **Nothing in the manifest is code.** Lanes are templates (`02` §2.6); conditions, bindings, and views are data (`08`); schemas are JSON Schema: a command's or query's `input` and an event's `payload` in Zod's input view (a defaulted field is optional), every other schema in its output view (ADR 0077).
- **Schemas are checked twice.** The kernel validates every payload at admission against the JSON Schema with Ajv (`03` §3.3 step 5). The host validates it again with the full Zod schema, including refinements (`.refine`, `.superRefine`), before calling the handler (for event deliveries, only of its own events, whose Zod schema it holds, ADR 0076), and validates the handler's output against the output schema before commit. Both failures are `VALIDATION_FAILED` with issues. Transforms, preprocess, pipes, and custom types are rejected at install, because the kernel could not enforce them.
- **Determinism**: running `setup` twice must produce the same manifest, byte for byte after canonical JSON (sorted keys). The loader checks this at install, and every host checks it at load.
- **Derived data is not stored**: derived capabilities (`subscribes` to foreign events, `provides-llm`) are computed from `subscriptions` and `llm.providers` when needed, so they can never disagree with the registrations.
- **Size**: at most 5 MB of canonical JSON, catalogs and page views included (`EXT_MANIFEST_INVALID` beyond).
- **Versioning**: `manifestVersion` is 1 in v2. A kernel reads only manifest versions it knows; a newer one fails install with `EXT_MANIFEST_INVALID` ("requires a newer kvman").
- **Upgrades are manifest diffs**: the capability diff (`06` §6.6), the grant dialog's "what changes", and the builder's publish card are computed by comparing two manifests.


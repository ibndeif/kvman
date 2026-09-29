# ADR 0002 — kvwebui

Status: accepted, 2026-09-29. Decided with the product owner in question rounds A–G.

1. **UI form.** Most UI is JSON view trees made of kvwebui's built-in components (page, list, table, form generated from a command's JSON Schema, markdown, a button that runs a command, chat). An extension that needs more ships a compiled Vue component (an ES module) that kvwebui loads by name.
2. **Discovery.** By convention, an extension may register a public query `<namespace>.ui.get` that returns its pages, nav items, and panels. When the browser loads, kvwebui reads `kernel.extensions.list` and calls every `<namespace>.ui.get`. The preset's `kvwebui.*` settings choose, order, and hide what's shown (home page, nav order). Nothing is pushed.
3. **Static files.** kvwebui's app and extensions' Vue bundles are `kvman.web` folders served by the kernel (ADR 0001, 59 and 74). kvwebui's namespace is `kvwebui`.
4. **Stack.** Vue 3 (Composition API, TypeScript), Vite, vue-router, Tailwind CSS with logical properties for right-to-left, and vue-i18n loading `/api/locales/:lang`. No component library.
5. **Frame.**
   - A top bar: the app title from the preset, a workspace picker, a language switch, and a light/dark switch.
   - A left sidebar of nav items, the page in the main area, and a toggleable right panel.
   - A bottom status bar: contributed items on the start side, kvwebui's built-ins on the end side.
   - Built-in Settings and Jobs pages.
6. **`<namespace>.ui.get`** takes `{}` and returns:
   - `pages: [{ id, title, view }]`
   - `nav: [{ id, page, title, icon, order }]`
   - `panels: [{ id, title, view }]`
   - `status: [{ id, query, input, text, order }]`

   Ids are local to the extension (full id `<namespace>.<id>`), and titles and texts are translation keys.
7. **Routes.**
   - A page's URL is `/<namespace>/<page>`, and a page may declare params (`/kvcoder/session/:sessionId`).
   - The preset's `kvwebui.home` names the page shown at `/`.
   - The current workspace is kvwebui state, not part of the URL.
8. **Data binding.**
   - A data component names a public query and its input. Input values may reference `{ "$param": name }` (a route param) or `{ "$row": field }` (the clicked row). There's no expression language.
   - A button or form names a command.
   - After a command succeeds, every query on the page reruns.
9. **Status items.** A status item's `text` key is filled from its query's output. The queries rerun after any command the UI runs, when a job the UI started ends, and every 30 s. The built-in items show the running-jobs count and the kernel's health.
10. **Components (first version).**
    - Layout: `stack` (vertical or horizontal), `tabs`, `card`.
    - Text: `heading`, `text`, `markdown` (sanitized).
    - Data: `table` (query, columns, row actions), `list` (query, item template), `detail` (query, fields).
    - Input: `form` (a command's JSON Schema becomes its fields; on submit, the page's queries rerun).
    - Action: `button` (a command and its input, an optional confirm, then rerun, navigate, or toast).
    - `chat`: a messages query and a send command; it streams the job's progress.
    - `custom`: a Vue component from an extension.
11. **Custom Vue.**
    - `{ type: 'custom', component: '<namespace>.<name>', props }` loads `/web/<namespace>/components/<name>.js`, which default-exports a Vue component.
    - kvwebui provides `vue` through an import map (one Vue instance); extensions build with `vue` as an external.
    - The component gets `props` plus an injected `kvman` object: `exec`, `execAsync`, `stream(jobId)`, `t`, `workspace`.
12. **Type-only imports.** An extension may `import type` from another extension that is both a `kvman.dependencies` entry and a devDependency. Runtime imports of other extensions stay forbidden, and ESLint checks both. (This refines ADR 0001, 50.)
13. **Invalid UI.** kvwebui validates every `<namespace>.ui.get` answer with zod at load. An extension whose answer is invalid, or whose `<namespace>.ui.get` fails, contributes nothing, and a dismissible error card lists the extension and its Problem. Other extensions are unaffected.
14. **Chat.** `{ type: 'chat', messages: { query, input }, send: { command, input } }`.
    - The messages query returns `[{ id, role: 'user' | 'assistant' | 'tool' | 'system', markdown, createdAt }]`.
    - The send command runs async with its input plus `{ text }`. Progress chunks whose `data` is `{ type: 'text', delta }` (from any source, ADR 0001, 79) append `delta` to a pending assistant bubble; other chunks are ignored, and a Stop button cancels the job.
    - When the job ends, the messages query reruns.
15. **Built-in pages.**
    - **Settings:** `kernel.settings.list` as JSON-Schema forms with global or workspace scope, and a secrets section that only sets or deletes values.
    - **Jobs:** `kernel.jobs.list`, with status and cancel.
    - **Extensions:** `kernel.extensions.list`, read-only.

    The preset hides any nav item with `kvwebui.nav.hidden`.
16. **UI control.** A command's handler calls `ctx.exec('kvwebui.effect.add', effect)` (toast, navigate, panel, refresh). kvwebui stores the effect against the job the UI started, and applies that job's effects when the job ends (at the sync reply or the stream's end). There's no background push.
17. **Current workspace.**
    - Each tab has its own, default Home, remembered in `localStorage` and sent as `workspaceId` on every call.
    - The picker lists `kernel.workspace.list`; "Open folder…" takes a typed absolute path.
    - Closing a workspace moves its tabs to Home.
18. **UI dependencies.** `lucide-vue-next` for icons (nav items name a lucide icon). `markdown-it` with HTML disabled, its output passed through `DOMPurify`. `v-html` appears only in that one sanitized component.
19. **Problems and theme.**
    - A failed command shows a toast with the translated `<ns>.errors.<CODE>`, plus field errors inside forms for `VALIDATION_FAILED`.
    - A failed query shows an error card in place of its component.
    - The theme is the global setting `kvwebui.theme`: `system` (default), `light`, or `dark`.
20. **Root job.** Effects attach to `ctx.job.rootId` (ADR 0001, 75).
21. **Sync job ids.** The UI gets a sync call's job id from the envelope (ADR 0001, 76).
22. **Effects.**
    - `toast { text, params?, level: 'info' | 'success' | 'warning' | 'error' }`
    - `navigate { page: '<ns>.<page>', params? }`
    - `panel { panel: '<ns>.<id>', open }`
    - `refresh {}`

    They're stored in kvwebui's workspace store. The public command `kvwebui.effect.take { jobId }` returns a job's effects and deletes them. A schedule deletes effects not taken within 1 hour.
23. **Settings.**
    - `kvwebui.title`: a translation key; default `kvwebui.title.default`, which is "kvman".
    - `kvwebui.home`: the full page id shown at `/`; default is the first nav item's page.
    - `kvwebui.nav.order`: full nav ids in order; the rest follow by `order`.
    - `kvwebui.nav.hidden`: full nav ids that aren't shown.
    - `kvwebui.theme`: `system`, `light`, or `dark`.
24. **View shapes (layout, text, data).** Every text is a translation key. `params` values and inputs may be `{ "$param": name }` or `{ "$row": field }`.
    - `stack { direction, gap?, children }`
    - `tabs { tabs: [{ title, view }] }`
    - `card { title?, children }`
    - `heading { text, params?, level }`
    - `text { text, params? }`
    - `markdown { text, params? }` or `markdown { query, input, field }`
    - `table { query, input, columns: [{ field, title, format? }], rowActions?, empty? }`
    - `list { query, input, item, empty? }`
    - `detail { query, input, fields }`

    A data component's query must be public. Table and list queries return arrays of objects.
25. **Form and button.**
    - `form { command, fixed?, submit, then? }`. The fields come from the command's input JSON Schema, minus `fixed`. Each label is the key `<command>.fields.<field>`, else the field's description.
    - `button { text, command, input, confirm?, style?, then? }`.
    - `Then` is `'rerun'` (the default), `{ navigate, params? }`, or `{ toast, level? }`. Effects apply after `then`.
26. **Page params.** `params: string[]`: `{ id: 'session', params: ['sessionId'] }` routes to `/kvcoder/session/:sessionId`. A nav item may point only at a page without params. `navigate` and `then` must give every param.
27. **Panels.**
    - One panel is open at a time, chosen from a strip of panel icons (panels have an `icon`).
    - The open panel is remembered per tab in `localStorage`, and a `panel` effect opens or closes one.
    - Panels show on every page.
28. **Status text.** `params` values may be `{ "$output": field }`, a top-level field of the status query's output (only in status items).
29. **Nav.** One flat list, ordered by `kvwebui.nav.order`, then `order`. The built-in pages come at the bottom, after a divider.
30. **Namespace.** kvwebui's namespace is `kvwebui` (supersedes `ui` in 3): its API is `kvwebui.effect.add` and `kvwebui.effect.take`, and its settings are `kvwebui.title`, `kvwebui.home`, `kvwebui.nav.order`, `kvwebui.nav.hidden`, and `kvwebui.theme`. The contribution convention `<namespace>.ui.get` is unchanged. `kernel.web.home` defaults to `kvwebui`.
31. **Component chunks.** The `chat` component renders any progress chunk whose `data` is `{ type: 'component', component: '<ns>.<name>', props }` inline as a `custom` component (ADR 0004, 7).
32. **`kvman.follow(jobId)`.** The injected `kvman` object also has `follow(jobId)`. Inside a chat, it streams that job into a new pending assistant bubble (with Stop) and reruns the messages query when the job ends. Elsewhere, it only reruns the page's queries when the job ends.

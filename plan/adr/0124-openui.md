# ADR 0124 — OpenUI: UI the agent draws in a reply and in an artifact

Status: accepted, 2026-11-09. Decisions 1 to 9 and the reading by group in 12 were asked of the product owner (the recommended options, except where
noted); 10 to 19 were proposed by the planner and accepted by the product owner together ("go ahead"). It amends plan 06 §6.1, §6.4, §6.8, and
§6.9, plan 08 §8.5 and §8.7, plan 13, and ADR 0009, 66.

## Context

The product owner asked for [OpenUI](https://github.com/thesysdev/openui) in kvcoder's conversation and artifacts. In
OpenUI, a model writes OpenUI Lang, one statement per line (`root = Card([title, table])`), using only the components
of a library defined with zod schemas, and a renderer draws it as it streams. It has no `eval`: a model can draw only
the components it was given, so the UI can be drawn in kvman's page, unlike an `html` artifact's frame.

What was found (npm and the repository, 2026-11-09):

- kvwebui is Vue 3. `@openuidev/vue-lang` 0.4.2 (MIT) is the Vue renderer: `Renderer`, `defineComponent`,
  `createLibrary`, the parser, and prompt generation. It depends on `@openuidev/lang-core` ^0.4.1, so it speaks OpenUI
  Lang 0.5; Lang 1.0 (`lang-core` 1.1.0) has only the React renderer for now. Lang 0.5 already has what OpenUI's
  components use: `$variables`, `@Set`, `@Reset`, `@Each`, `@Filter`, `@Sort`, `@Count`, conditions, and inputs bound
  to a variable (`markReactive`).
- OpenUI's components are React only. `@openuidev/react-ui` 0.18.5 (MIT) defines two libraries: `openuiLibrary`, 82
  components with root `Stack`, and `openuiChatLibrary`, root `Card`, which adds `FollowUpBlock`, `FollowUpItem`,
  `SectionBlock`, and `SectionItem` and gives its containers (`Card`, `Tabs`, `Accordion`, `Carousel`) wider schemas
  under the same names: 86 names in all. `vue-lang` ships no component; OpenUI's own Vue example writes its five.
- Alternatives were looked at: Vercel's json-render (`@json-render/vue` 0.22.0) has no Vue components either;
  `a2ui-vue` 0.9.5 has 18, but one maintainer, an old A2UI version, zod 3, no table or chart, and physical CSS.
- `lang-core` has an install script that reports the install to PostHog unless `OPENUI_TELEMETRY_DISABLED` or
  `DO_NOT_TRACK` is set; its reporting at run time is off unless `OPENUI_RUNTIME_TELEMETRY_ENABLED` is set. Neither
  package uses `eval` or `new Function`; `vue-lang`'s CSS is one spinner animation.

## Decisions

1. **OpenUI with `@openuidev/vue-lang` 0.4.2** (asked; recommended over writing a Vue renderer for Lang 1.0 and over a
   React island). It moves to Lang 1.0 when the Vue binding does, by a later ADR.
2. **kvwebui owns it, as it owns Mermaid** (asked; recommended over kvcoder alone). Drawing OpenUI is a generic part of
   the web app: a fenced `openui` block in any Markdown view, and the view `openui`. kvcoder teaches its agent and
   handles what a press sends.
3. **What drawn UI may do** (asked; recommended over also reading live kvman data, and over display only). A press
   sends a message as the person (OpenUI's `@ToAssistant`), a link opens a new tab through `kvman.open`, and
   `$variables` with `@Set` and `@Reset` change only what the page shows. There is no `Query()` or `Mutation()`: the
   renderer gets no tool provider, the reference doesn't name them, a `Query` gives `null`, and `@Run` does nothing.
4. **All of OpenUI's components, by OpenUI's names, in three milestones** (asked twice: first a set of 19 written for
   kvman, then, at the product owner's question "can we support all available components?", all 86 names of both
   libraries, recommended in three milestones over one and over `openuiLibrary` alone). Each component's name, props
   schema, and description are OpenUI's, from `@openuidev/react-ui` 0.18.5, so the agent writes OpenUI as OpenUI
   documents it; the Vue component that draws it is kvwebui's. A reply is read with the chat library, an artifact with
   `openuiLibrary` (decision 13). The milestones are M5.18 (the renderer, the connector, layout, content, forms,
   buttons, icons, tags, follow-ups), M5.19 (tables, charts, lists), and M5.20 (card blocks, images, modal,
   carousel, option cards).
5. **A connector, read on demand** (asked: "it should be a connector, so the user can switch it off", and "read on
   demand" over always in the prompt). kvcoder's own connector `openui` has one command, `guide`, which returns the
   reference. Its entry in the connector index is its description and command line only. Turning it off is
   `kvcoder.connectors.disabled`, as for every connector (ADR 0014, 7).
6. **A press sends at once, and only the newest reply and artifacts are live** (asked; recommended over filling the
   send box, and over every reply staying live). A press sends the message as `kvcoder.message.send` does for typed
   text, so while the agent works it steers the turn. Presses work in the lead's newest reply and in every `openui`
   artifact; in older replies the UI is drawn disabled. A press sends apart from the send box: what the person is typing there
   stays, and a failed press says so in a toast and can be pressed again.
7. **Images are workspace files or `data:` addresses** (asked; recommended over any `https` image and over no
   images). An image's `src` is a path in the workspace, read with `kvwebui.image.get` (decision 19), or a `data:`
   address of an image type; anything else, a web address included, draws a placeholder with the address as text,
   and nothing loads from the network. The same holds for an image in the Markdown of an OpenUI component
   (`TextContent`, `MarkDownRenderer`, a step's details): one that isn't a `data:` image is shown as its alternative
   text and its address (found while building; the Markdown views outside OpenUI are unchanged).
8. **Every Lucide icon, loaded on demand** (asked; recommended over a fixed list). `Icon` draws any Lucide icon by its
   kebab-case name from `@lucide/vue`'s full set, each icon its own module that loads the first time it is shown (the
   loader kvwebui's contributed icons already use). A name that isn't an icon falls back as OpenUI's does, and as its
   description tells the model: to its `category`'s icon from OpenUI's table (`finance` is `dollar-sign`, `time` is
   `clock`, …), else to `circle-dot` (asked while building, since "an unknown name draws nothing" disagreed with the
   description copied by decision 4; OpenUI's fallback was recommended).
9. **Charts with `d3-scale` and `d3-shape`** (asked; recommended over hand-written SVG). They compute scales, ticks,
   arcs, and curves; kvwebui's Vue draws the SVG, colored from `--kv-color-chart-1` to `--kv-color-chart-8`, new
   variables kvwebui defines for light and dark.
10. **The dependencies** (accepted). Pinned exactly, as `devDependencies` of kvwebui bundled by Vite into `dist/web`:
    `@openuidev/vue-lang` 0.4.2, `@openuidev/lang-core` 0.4.1, `zod` 4.6.5 (the SDK's), `d3-scale` 4.0.3, `d3-shape`
    3.2.1, `@types/d3-scale` 4.0.9, and `@types/d3-shape` 3.2.0. A person who installs kvman never downloads them, so
    the install script never runs there, and pnpm runs no dependency's install script in the repository. The bundle
    reads no environment, so the run-time reporting stays off. So that the app's code may import them, the import
    walls let a file under an extension's `web/` folder, which its build bundles, import the extension's
    devDependencies, as a test or a top-level config file may (asked while building; recommended over making them
    runtime dependencies, which npm would install, running the install script, for every person).
11. **OpenUI's schemas, copied with their notice** (accepted). The schemas and descriptions are copied from
    `@openuidev/react-ui` 0.18.5 into kvwebui's source, each file naming it, and its MIT notice is kept in kvwebui's
    `THIRD-PARTY-NOTICES.md`, which the package ships.
12. **The reference is generated, and read by group** (accepted; the reading by group was asked after measuring:
    OpenUI's reference is 27 to 29 KB without its examples and 36 to 54 KB with them, while a connector result is cut
    at 30 KB; recommended over the whole reference without examples and over exempting it from the cut). kvwebui's
    script `openui:reference` writes, from each library's `prompt()` (OpenUI Lang 0.5, as `lang-core` 0.4.1 writes
    it), the pages of `kvwebui.docs.get`:
    - `openui-chat` (the chat library) and `openui` (`openuiLibrary`), the index: kvman's rules (decisions 3, 7, 13,
      and 14), OpenUI Lang's syntax, actions, streaming, and rules, then each of OpenUI's component groups as one line
      with its component names, and two short examples kvman writes (a choice with follow-ups in a reply, a small
      dashboard in an artifact); at most 8 KB;
    - `openui-chat-<group>` and `openui-<group>`, one per group: its component signatures and OpenUI's notes for it;
      `<group>` is the group's name in lowercase with each run of other characters a `-` (`Charts (2D)` is
      `charts-2d`, `Lists & Follow-ups` is `lists-follow-ups`), and components in no group form the group `Other`.
    OpenUI's whole-program examples are left out, and so is every note that uses `Query`, `Mutation`, or `@Run`; a
    note about a query's rows (`data.rows`) reads `items`, an array the UI holds (M5.19), and lang-core's generic
    "Important Rules" section is left out of the index to keep it within its size. A test
    fails when a page differs from what the script writes. Until M5.20, a group has only the components that are built,
    and a group with none has no page.
    `openui guide { place, groups? }`, with `place` `'reply'` (the chat library) or `'artifact'` (`openuiLibrary`),
    answers the index, or with `groups` (1 to 13 of the library's group names) those groups' pages joined in the order
    given; a name the library has no page for fails `VALIDATION_FAILED` and names the groups. Every answer is at most
    30 KB, so it is never cut.
13. **Where the agent draws it** (accepted). The connector's description tells the agent: in a reply, a fenced
    `openui` block for a small piece the person acts on now (a choice, a short form, a summary of numbers, follow-up
    suggestions); in an artifact, `format: 'openui'` for a dashboard or report the person keeps; Markdown stays the
    default for prose, and a diagram stays Mermaid. An `openui` artifact is never inferred: `format` must say so. A
    helper never has `openui`, as it never has `ask`, since it doesn't talk to the person.
14. **What a press sends** (accepted). A button's `@ToAssistant(text)` sends `text`, a button with no action its label,
    and a `FollowUpItem` its text. A button inside a `Form` sends that text, a blank line, then one line
    `<label>: <value>` per `FormControl` in order, after the form's rules pass: `<label>` is the control's label, and
    `<value>` is the text typed (`Input`, `TextArea`), the date (`DatePicker`, a range as `<start> – <end>`), the number
    (`Slider`, a range as `<low> – <high>`), or the label of each item chosen (`Select`, `RadioGroup`, `Chips`,
    `CheckBoxGroup`, `OptionCards`) joined by `, `; nothing typed or chosen is `(empty)`. An `EditableTable`'s save sends
    its text and the table as Markdown. `@OpenUrl` opens only an `http` or `https` address; any other does nothing. A
    form's values are kept only while the page shows it.
15. **When it can't be drawn** (accepted). While a block streams, what has parsed is drawn. After the stream, a block
    whose parse has no root (no statement parses, or the root is an unknown component; with no `root` statement the first
    one is the root, as OpenUI reads it) is shown as its source in a code block, as a Mermaid block that
    isn't a diagram is; an unknown component or a missing required field leaves that part out. kvwebui's own words
    ("Couldn't draw this UI", the image placeholder, a form's rule errors) are translation keys with `en` and `ar`.
16. **The look** (accepted). Every component uses the `--kv-*` variables and logical properties only, every text the
    model wrote has `dir="auto"`, `MarkDownRenderer` and `TextContent`'s Markdown go through the sanitized `markdown`
    view, `CodeBlock` is a monospace block with Copy, `DatePicker` is the browser's date input, `Modal` is a dialog
    over the page with Escape and a close button, and `Carousel` scrolls sideways with snapping and buttons, mirrored
    right to left.
17. **Turned off** (accepted). With `openui` in `kvcoder.connectors.disabled`, the agent isn't told of it,
    `openui guide` gets the answer for a connector that doesn't exist, and `artifact write` with `format: 'openui'`
    fails `VALIDATION_FAILED` ("The openui connector is turned off."). Blocks and artifacts already in a chat are still
    drawn.
18. **The `View` component's `onMessage`** (accepted). kvwebui's `View` takes an optional `onMessage(text)`. Presses in
    an `openui` block or view work only when it is given, and call it; kvwebui itself sends nothing. kvcoder gives it
    for the lead's newest reply and for the artifact panel.
19. **`kvwebui.image.get`** (accepted; M5.20). A public query, `{ path }` → `{ type, data }`: the workspace's image at
    `path` (relative to the workspace, or absolute inside it, resolved through links and refused when it leaves the
    workspace) as base64, for `image/png`, `image/jpeg`, `image/gif`, or `image/webp` by its content, at most 5 MiB.
    A path outside the workspace or another type fails `VALIDATION_FAILED`, a missing file `NOT_FOUND`, and a larger
    one `TOO_LARGE` (`params.limit`). SVG is never read, since it can hold scripts.

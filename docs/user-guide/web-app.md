# The web app

This page is for anyone using kvman in the browser. You will be able to find your way around the app: the top bar, the sidebar, pages, panels, and the status bar — and change the language or the theme.

kvwebui is the extension that draws the app. Pages, nav items, panels, and status items come from the extensions your preset runs; kvwebui itself holds no product concepts.

## The frame

```text
┌─ kvman ─ [workspace ▾] ── [🌐 English ▾] [☀ ▾] ─┐
│ nav      │        page         │ ▣ panel  │
│ …        │                     │ strip    │
│ ──────   │                     │          │
│ Settings │                     │          │
│ Extensions                     │          │
├──────────┴─────────────────────┴──────────┤
│ contributed status items    built-in items │
└────────────────────────────────────────────┘
```

The frame below is what the `coder` preset shows. A preset for a product can hide parts of it: pages of the sidebar (Settings and Extensions included), status items, and the workspace picker.

## Top bar

- **Title** — `kvwebui.title`; for the bundled `coder` preset it reads "kvman Coder".
- **Workspace picker** — the current folder's name, or **Home**. It lists every open workspace (Home first, then the rest in open order) with a close button on each but Home, the closed workspaces, and **Open a folder…** at the bottom. See [workspaces.md](workspaces.md).
- **Language menu** — every language your extensions ship, each named in itself (English, العربية, …). Choosing one switches the interface and the text direction at once.
- **Theme menu** — System, Light, or Dark. Your choice is remembered.

## The sidebar (nav)

- One flat list of pages, in preset order. The built-in pages **Settings** and **Extensions** sit below a divider.
- The toggle at the top collapses the nav to icons only; your choice is remembered in this browser.
- On a narrow screen (below 768 px) the nav is always the icon rail, and the toggle opens the full nav as an overlay that closes when you pick a page.

## Pages

Each extension contributes pages. A page's address looks like `/<namespace>/<page>`; the preset chooses which page `/` shows (for `coder`, the Chat page). Tabs keep their workspace; the browser tab title reads `<page> · <workspace> · <app title>`.

A preset that names no home page opens on the **Extensions** page. If the preset's home page isn't available, `/` shows the **Extensions** page with an error card.

A fenced `mermaid` block in any Markdown the app shows (an answer, an artifact, a documentation page) is drawn as a diagram, in the app's theme.

## Panels

One panel can be open at a time, chosen from the strip of panel icons on the page. Panels show on every page, and the choice is remembered per tab. (The artifacts and execution-map panel beside a chat is the chat's own; see [coding-app.md](coding-app.md#the-panel-artifacts-and-the-execution-map).)

## Status bar

- The start side begins with the current workspace's folder (the home folder shows as `~`; the full path is the tooltip), then items contributed by extensions, like the tokens-and-cost readout and the count of chats waiting for you.
- The end side shows kvman's version with a green dot, or a red "offline" while kvman isn't answering.
- An item whose data fails shows a small error mark; hover for the reason.

## Language and direction

kvman ships English and Arabic. Arabic is right-to-left, and the whole interface flips direction to match. Setting `kernel.language` to a code a loaded catalog doesn't have fails `VALIDATION_FAILED`. Text sent to a model stays English; a harness asks the model to reply in your language.

## Light and dark

The theme menu sets `kvwebui.theme`: `system` (the default — follow the OS), `light`, or `dark`.

## Narrow screens

Below 768 px the sidebar collapses to the icon rail, and the artifacts panel in the Chat page opens over the conversation instead of beside it. Everything stays usable.

## Next

- [workspaces.md](workspaces.md)
- [desktop-app.md](desktop-app.md)
- [settings-and-secrets.md](settings-and-secrets.md)

# Getting started

This page is for someone who has never built a kvman extension. In about 15 minutes you will scaffold one, run its tests, see it in kvman, edit it and watch it reload, and preview it. Nothing here needs an AI, and everything works the same if one is helping you.

You need Node.js 24 and npm.

## 1. Install kvman and its tools

```sh
npm i -g kvman @kvman/testkit --no-fund --loglevel=error
```

`kvman` is the app. `@kvman/testkit` puts the tools on your PATH: `kvman-new`, `kvman-check`, `kvman-preset`, `kvman-preview`, and `kvman-docs`. Every scaffolded project also depends on it, for its tests and `npm run check`.

## 2. Scaffold an extension

```sh
kvman-new ./notes --name @me/notes --namespace notes
```

`kvman-new` writes the project into `./notes` and runs `npm install` in it. That install is the only step that needs the network. It prints the next steps. Look at what it wrote:

| File | What it is |
|---|---|
| `package.json` | the package, with the `kvman` field: `namespace`, `source` |
| `src/index.ts` | registers a query `notes.greeting.get`, a page, and the docs pair |
| `src/docs.ts` | serves the pages in `extension-docs/` |
| `extension-docs/usage.md` | the page your extension tells others |
| `locales/en.json`, `locales/ar.json` | every text a person sees, in two languages |
| `test/extension.test.ts` | a test that loads the extension in a real kernel |
| `docs/` | the platform guides: `sdk.md`, `i18n.md`, `presets.md` |
| `AGENTS.md`, `CLAUDE.md` | instructions any assistant reads first |

Add `--web` to also get a sample Vue component and its build.

## 3. Test and check it

```sh
cd notes
npm test
npm run check
```

`npm test` runs the test against a real kvman kernel. `npm run check` is `kvman-check`: it loads the extension and reports what kvman would refuse (a bad name, a missing description) or show untranslated (a text key one language lacks). A clean project prints nothing and exits 0.

## 4. Run it in kvman

An extension runs because a preset lists it. Make one:

```sh
kvman-preset new ./notes-app.json --name notes-app
```

Open `notes-app.json` and add your project, with the folder relative to the preset file, and make its page the home page:

```json
{
  "name": "notes-app",
  "extensions": {
    "@kvman/kvai": "bundled",
    "@kvman/kvwebui": "bundled",
    "@me/notes": "path:./notes"
  },
  "settings": { "kvwebui.home": "notes.hello" }
}
```

```sh
kvman --preset ./notes-app.json
```

kvman asks whether you trust `@me/notes` (answer `y`, or add `--yes`), starts, and opens the browser on your page, which shows the greeting.

## 5. Edit it and watch it reload

A `path:` extension loads `src/index.ts` directly and reloads when you save any file in its folder. Change the greeting in `src/index.ts`, save, and refresh the page: the new text shows, with no build.

## 6. Preview it

You don't need a preset to try a project. In another terminal:

```sh
kvman-preview ./notes
```

`kvman-preview` starts a second kvman on a temporary home, with your project loaded, and prints its URL. Press Ctrl+C to stop it; it cleans up. See [preview-and-hot-reload.md](preview-and-hot-reload.md).

## 7. Read what is installed

```sh
kvman-docs list
```

With kvman running, this lists the platform guides (`conventions`, `sdk`, `i18n`, `presets`) and the pages each installed extension serves, including your own `usage` page. `kvman-docs get @me/notes usage` prints it.

## What next

- [anatomy.md](anatomy.md) explains every part of what you just made.
- [sdk.md](sdk.md) lists everything `ctx` can do.
- [views.md](views.md) shows how to turn your queries and commands into pages.

## Next

- [anatomy.md](anatomy.md)
- [sdk.md](sdk.md)
- [testing.md](testing.md)

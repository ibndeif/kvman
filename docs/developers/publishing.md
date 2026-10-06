# Publishing an extension

This page is for anyone who wants to share an extension. When you finish, you can lay out a package other people can name in a preset, version it against the SDK, and know what users see when they trust it. It also has a short note for people coming from kvdev.

## The package

An extension is an npm package ([anatomy.md](anatomy.md)). To publish one:

- `main` points at the built entry (`dist/index.js`), because `npm:` extensions load `main` (only a local `path:` extension may load `kvman.source`). The scaffold's `npm run build` compiles it.
- `files` lists what ships: `dist`, `locales`, `extension-docs` (and `dist/web` for components).
- `@kvman/sdk` is a **peer dependency**, with a range that includes the SDK versions you support (`^0.1.0` while kvman is 0.x). kvman refuses an extension whose peer range doesn't include the kernel's SDK version.
- Declare other extensions you need in `kvman.dependencies` with ranges.
- Ship `locales/en.json` and `locales/ar.json` at least, and docs pages ([documenting-your-extension.md](documenting-your-extension.md)).

Run `npm run check` and `npm test`, then publish as any npm package.

## Users add it

A user names it in a preset, or on the Extensions page, with an **exact** version:

```json
{ "extensions": { "@acme/notes": "npm:1.2.3" } }
```

At the next start kvman runs `npm install --ignore-scripts --omit=dev --legacy-peer-deps` for it into `<home>/extensions/<name>@<version>/` (install scripts never run, and the kernel supplies `@kvman/sdk`). npm must be on the PATH.

## Trust

A non-bundled version loads only after the user accepts it: at start, kvman lists its name, version, and source and asks `y` or `N` in the terminal. Accepted versions are remembered; **a new version asks again**. There is no sandbox in this phase, so your code runs with the user's permissions: keep what you do honest and minimal, and never read what isn't yours (secrets are per extension).

## Versions

Follow semver. Because users pin an exact version, a bad release is fixed by a new version, not an update in place. Breaking a public command, query, or setting breaks everyone who calls it, so version it deliberately; a dependent that calls a name you dropped gets `NOT_FOUND`.

## Changesets in this repository

Contributors to kvman itself: every change to `@kvman/sdk`, `@kvman/testkit`, or an extension needs a changeset (`.changeset/<name>.md` with the package and the bump); the kernel and the CLI follow the root version. A release is a pushed tag `v<root version>`, which the release workflow publishes to npm; the steps are in the repository's README. See [contributing.md](contributing.md).

## Migrating from kvdev

Earlier versions had an extension called kvdev and a `dev` preset. In this version:

- kvdev, later kvcustomizer, is **kvbuilder** (`@kvman/kvbuilder`, namespace `kvbuilder`), shown as "kvman builder"; its commands are `kvbuilder.*`, its errors `kvbuilder/*`. A preset of your own that names `@kvman/kvcustomizer` must name `@kvman/kvbuilder` instead.
- The `dev` preset is gone; `coder` loads kvbuilder. A personal `<home>/presets/coder.json` replaces the bundled one.
- The scaffold, the preset tools, and the preview are the testkit's bins (`kvman-new`, `kvman-preset`, `kvman-preview`), usable without any agent; the six guides are split: `sdk`, `i18n`, and `presets` ship with the testkit, and each extension serves its own pages through `docs.list` and `docs.get`.

## Next

- [anatomy.md](anatomy.md)
- [contributing.md](contributing.md)
- [documenting-your-extension.md](documenting-your-extension.md)

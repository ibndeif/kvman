# QA 38 — publishing to npm (ADR 0026)

Asked: the code is on GitHub; publish to npm so people can install kvman and developers can build extensions with its packages. Decided in ADR 0026; plan 01 §1.2 and §1.4, plan 02 §2.9, and plan 11. This file is the contract; every scenario's test name starts with its id. The tests read manifests and files; none of them reaches npm.

Eight packages are published under MIT. `kvman` depends on the four extensions, and a bundled extension is a dependency of the `kvman` package that has a `kvman` field. The bundled presets are in `packages/cli/presets/`. A release is a pushed tag `v<root version>`, published by `.github/workflows/release.yml`.

## Happy path

- **QA38-H1 The bundled extensions are kvman's dependencies.** *Then* `bundledExtensions()` names `@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, and `@kvman/kvcustomizer`, each with the folder that holds its package.json, and every one is a `workspace:*` entry of the `kvman` package's `dependencies`. `packages/cli/test/bundled-extensions.test.ts`
- **QA38-H2 The bundled presets are inside the kvman package.** *Then* `bundledPresetsFolder` is `packages/cli/presets`, it holds `coder.json`, the `kvman` package's `files` lists `presets`, and the repository root has no `presets` folder. `packages/cli/test/bundled-extensions.test.ts`
- **QA38-H3 Every package can be published.** *Then* each of the eight packages isn't `private`, has `license: "MIT"`, a `repository` with the GitHub URL and its own `directory`, a `homepage`, `bugs`, `files`, a version, and a `LICENSE` and a `README.md` beside its package.json. `packages/cli/test/published-packages.test.ts`
- **QA38-H4 A package's file can be resolved.** *Then* the kernel and each extension export `./package.json`. `packages/cli/test/published-packages.test.ts`
- **QA38-H5 A runtime import is an npm dependency.** *Then* every extension that imports another extension's subpath at runtime (not `import type`) lists that extension in `dependencies`, pinned as every dependency is, and in `kvman.dependencies`; kvcoder lists `@kvman/kvai` as `workspace:*`. `packages/cli/test/published-packages.test.ts`
- **QA38-H6 The release workflow publishes on a version tag.** *Then* `.github/workflows/release.yml` runs on a pushed `v*` tag only, has `id-token: write`, and runs the tag check, then `pnpm build` (a fresh checkout has no `dist`, which the end-to-end tests need), `pnpm typecheck`, `pnpm lint`, and `pnpm test` before `pnpm changeset publish`. `packages/cli/test/release-workflow.test.ts`
- **QA38-H7 The first changelogs.** *Then* each of the six packages Changesets releases has a `CHANGELOG.md` whose first version is `0.1.0`. `packages/cli/test/published-packages.test.ts`

## Edge cases

- **QA38-E1 A dependency without a `kvman` field isn't bundled.** *Then* `bundledExtensions()` has neither `@kvman/kernel` nor `@kvman/sdk`; and for a package folder whose dependencies are one extension and one plain package, only the extension is named. `packages/cli/test/bundled-extensions.test.ts`
- **QA38-E2 A package with no dependencies has no bundled extensions.** *Then* the answer is empty. `packages/cli/test/bundled-extensions.test.ts`
- **QA38-E3 A dependency that isn't installed fails.** *Given* a package folder that lists a dependency its `node_modules` doesn't hold, *then* `bundledExtensions(folder)` throws, naming the dependency. `packages/cli/test/bundled-extensions.test.ts`
- **QA38-E4 A tag that isn't the root version stops the release.** *Then* the workflow's first step after the checkout compares the tag with `v<root version>`, and it runs before the install and the publish. `packages/cli/test/release-workflow.test.ts`
- **QA38-E5 The token is never written into the repository.** *Then* the workflow reads the token only from `secrets.NPM_TOKEN`, and no `.npmrc` in the repository holds an `_authToken`. `packages/cli/test/release-workflow.test.ts`
- **QA38-E6 Every action is pinned to a commit.** *Then* each `uses:` line of the workflow names a 40-character commit, with its version as a comment, so a moved tag can't change what runs with the right to publish. `packages/cli/test/release-workflow.test.ts`

## After the first release

- **QA38-H8 The documented install is the quiet command.** *Then* the root README, the `kvman` package's README, the user guide's first page and its install page (the install and the update), and the developers' getting-started page give the install with `--no-fund --loglevel=error`; the install page names the three notices and says not to allow the scripts. `packages/cli/test/install-command.test.ts`
- **QA38-H9 kvai uses pi-ai 1.0.4.** *Then* kvai's `dependencies` pin `@earendil-works/pi-ai` at `1.0.4`, and the built-in list still has `anthropic/claude-sonnet-5-5` (M2.1's own check). `packages/cli/test/install-command.test.ts`
- **QA38-E7 No page gives the install without the flags.** *Then* every `npm i -g kvman` line in the README files and in `docs/` ends with the two flags. `packages/cli/test/install-command.test.ts`
- **QA38-H10 The kernel and the CLI follow the root version.** *Then* `packages/kernel` and `packages/cli` have the version of the root package.json. `packages/cli/test/published-packages.test.ts`

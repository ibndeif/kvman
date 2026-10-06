# ADR 0026 — Publishing to npm

kvman's code is on GitHub (`ibndeif/kvman`) and nothing was published. Publishing as the plan stood would have shipped a `kvman` package with no extensions and no presets: the CLI found both at the repository root, which a tarball doesn't hold. The product owner asked to publish (2026-10-06) and chose the answers below from alternatives.

Chosen, over the alternatives in parentheses:

- **The extensions are published too** (over copying their built output into the `kvman` package at pack time, and over one bundled file): `kvman` depends on them, and npm installs them with it.
- **MIT** (over Apache-2.0, AGPL-3.0, and no licence).
- **GitHub Actions publishes, on a version tag** (over publishing by hand, a Changesets release pull request, every push to main, and a manual run only).
- **The first version is 0.1.0, with the pending changesets folded in** (over letting Changesets bump, and over a `next` tag).
- **A runtime import of another extension is an npm `dependencies` entry** (over a `peerDependencies` entry, and over a kernel resolve hook).
- **The web scaffold still declares no dependency** (over declaring `@kvman/kvwebui`).

## Decisions

1. **Eight packages are published**, all public and under MIT: `kvman`, `@kvman/sdk`, `@kvman/kernel`, `@kvman/testkit`, `@kvman/kvai`, `@kvman/kvwebui`, `@kvman/kvcoder`, and `@kvman/kvcustomizer`. This supersedes ADR 0008, 19, where the extensions weren't published on their own. Each package has `license`, `repository` (with its `directory`), `homepage`, `bugs`, a `LICENSE` file, and a `README.md`.
2. **`kvman` depends on the four extensions**, at the exact version of the release (`workspace:*`). `npm i -g kvman` is still the whole install.
3. **A bundled extension is a dependency of the `kvman` package that has a `kvman` field.** The CLI resolves `<name>/package.json` for each of its `dependencies`, as Node resolves any module, so the repository and an installed kvman take the same path. Every extension, and the kernel, exports `./package.json` for this. The preset source `bundled`, `bundled:<name>` (ADR 0025), and the trust rule (§2.9) are unchanged.
4. **The bundled presets are in the `kvman` package**: `packages/cli/presets/`, listed in its `files`. The root `presets/` folder is gone.
5. **A runtime import needs an npm dependency.** An extension that imports a subpath of another extension at runtime (ADR 0001, 89) lists that extension in `dependencies`, pinned exactly as every dependency is (CLAUDE.md §5): kvcoder lists `@kvman/kvai` as `workspace:*`, which is published as the version of the release. A second installed copy is harmless, because such a subpath holds no state. A type-only import stays a devDependency. `kvman.dependencies` is unchanged: it is still what the kernel checks and orders by.
6. **The web scaffold declares no dependency**, as in ADR 0009, 128. Its reason there (kvwebui isn't published) no longer holds; the one that remains is that nothing in a scaffolded project imports kvwebui, so its test kernel and `kvman-check` load without it.
7. **The first version is 0.1.0 for all eight** (ADR 0009, 9). The changesets written before the first release are folded into each package's `CHANGELOG.md` under `0.1.0` and removed, with no bump. From then on a changeset bumps its package as usual, and the extensions are released by Changesets with the SDK and the testkit. The kernel and the CLI still follow the root version.
8. **A release** is: `pnpm changeset version`, the root, kernel, and CLI versions set, a commit, and a tag `v<root version>` pushed. `.github/workflows/release.yml` runs on that tag: it fails unless the tag is `v<root version>`, runs `pnpm build` first (a fresh checkout has no `dist`, which the end-to-end tests need), then `pnpm typecheck`, `pnpm lint`, and `pnpm test`, then `pnpm changeset publish`, which publishes each version that isn't on npm yet. `pnpm bench:check` stays a local gate: its baseline belongs to the developer's machine.
9. **npm trusted publishing.** The workflow has `id-token: write`, and each package names this workflow as its trusted publisher on npm, so no token is stored and each version has provenance. Each action the workflow uses is pinned to a commit, as every dependency is pinned. A package must exist before it can name a publisher, so the first release uses a granular token in the repository secret `NPM_TOKEN`; the secret is deleted once the publishers are set.
10. **This is the only CI.** The gates still run locally before every commit (CLAUDE.md §2).

## Plan changes

`01` §1.2 (Installing) and §1.4 (the package table, the tools sentence); `02` §2.9 (the `bundled` source); `11` (where the preset file is).

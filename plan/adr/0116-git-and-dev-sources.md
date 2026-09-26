# ADR 0116 — Fetching `git:` sources, and `dev:` in M2.2

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`06` §6.1 says every git command runs with `-c protocol.ext.allow=never -c protocol.file.allow=user` and `--` before the URL. pnpm's own git resolver cannot guarantee that.

`dev:<name>@<n>` versions are recorded by `kernel.dev.folder.stage` (M2.14) and `kernel.dev.build` (M6.1). Neither is built yet. What does M2.2 build for them?

## Options

Git:
1. **The kernel runs git**, packs the checkout with pnpm, and installs the tarball.
2. **pnpm resolves git**, with the flags passed through `GIT_CONFIG_*` variables.

Dev:
1. **The folder pipeline only.**
2. **Defer `dev:` entirely.**

## Decision

Option 1 for both.

**Every source except `builtin:` and `local:` becomes one package tarball.** The bundled pnpm then installs that tarball into the staging tree:

- options `--ignore-scripts --prod`, `node-linker=hoisted`, `auto-install-peers=false`, `package-import-method=copy`;
- a store and cache inside the staging tree;
- the registry from `KVMAN_NPM_REGISTRY`.

**Sources:**

- **`npm:`.** The kernel reads the version's metadata from the registry, downloads `dist.tarball`, and checks its sha512 against `dist.integrity`. A mismatch fails `EXT_SOURCE_INVALID`. The integrity is recorded with the version.
- **`git:`.** The kernel runs `git -c protocol.ext.allow=never -c protocol.file.allow=user clone --no-checkout -- <url> <dir>`, then `checkout --detach <commit>`, and verifies that `HEAD` is exactly the commit. It packs the checkout with `pnpm pack`, scripts disabled. The integrity is `git:<commit>`.
- **`dev:` folders.** A folder is packed with `pnpm pack`, scripts disabled, then installed like the others.
  - The folder pipeline is a kernel function that the future commands will call, and M2.2 tests it directly.
  - Until M2.14 and M6.1 record dev versions, `kernel.extension.stage {source: 'dev:…'}` fails `EXT_SOURCE_INVALID` with "no dev version <name>@<n> is recorded".

**After install**, pnpm's bookkeeping is removed from the tree: the store, the cache, the lockfile, `node_modules/.pnpm`, `.modules.yaml`, the workspace state, and every `.bin` folder. The root `package.json` is removed too. The snapshot is `node_modules/<name>/` plus the hoisted dependencies. The entry is `node_modules/<name>/<main>`.

**Time limit.** Fetching (metadata, download, clone, checkout, pack, install) is killed after 5 minutes. It then fails `EXT_SOURCE_INVALID` with "fetching the source took longer than 5 minutes", and the staging tree is deleted (ADR 0118).

**Tests** serve git repositories with a local `git daemon` (`git://127.0.0.1:<port>/…`) and npm packages from Verdaccio.

## Consequences

`06` §6.2 describes this resolution step.

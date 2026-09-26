# ADR 0117 — The undeclared-import scan

- **Status**: accepted
- **Date**: 2026-09-26
- **Milestone**: M2.2
- **Decided by**: the product owner

## Question

`06` §6.2 says "every .js/.mjs/.cjs file is scanned", and each import must name "a Node built-in (node:*), a relative file inside the tree, or a package in dependencies / peerDependencies". Four things are open:

- Are the files of the dependencies scanned too?
- Do bare built-in names count as built-ins?
- Are other specifier forms allowed?
- What if `@kvman/sdk` is listed in `dependencies`, which would install a second SDK copy?

## Options

1. **The extension's own files; bare built-ins allowed; only the plan's forms; a `@kvman/sdk` dependency is rejected.**
2. Every file in the snapshot, each checked against its nearest `package.json`.
3. Only `node:` built-ins.
4. Self-reference and `#` subpath imports also allowed.

## Decision

Option 1.

**What is scanned.** The `.js`, `.mjs`, and `.cjs` files of the extension package: `node_modules/<name>/`, excluding any nested `node_modules/`. Each file is lexed with es-module-lexer, and a file it cannot lex fails with its path.

**Every static import, and every dynamic import with a literal specifier, must name one of:**

- a Node built-in, with or without the `node:` prefix (Node's `isBuiltin`);
- a relative path (`./`, `../`) that stays inside the extension's package folder;
- a package in `dependencies` or `peerDependencies`. The package name is the specifier up to its first `/`, or up to its second `/` for a scoped name.

**Anything else fails `EXT_SOURCE_INVALID`**, with the file and the specifier in the detail and `params` `{ file, specifier }`. That includes the package's own name, `#` subpath imports, absolute paths, and URLs (`file:`, `http:`, `data:`).

**A dynamic import with a computed specifier** is a warning in the stage reply. It has the code `DYNAMIC_IMPORT` and the file as its path.

**`@kvman/sdk` in `dependencies`** fails `EXT_SOURCE_INVALID` with "declare @kvman/sdk in peerDependencies". An import of `@kvman/sdk` with no peer declaration fails the scan like any undeclared import.

es-module-lexer sees only ES module syntax. A `require()` call in a `.cjs` file is not checked.

## Consequences

`06` §6.2 states the rules.

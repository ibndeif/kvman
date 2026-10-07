# kvman

## 0.3.0

### Minor Changes

- `kvman uninstall [--home <dir>] [--yes] [--keep-data | --delete-data]` removes kvman: it asks first, stops a kvman running on that home, runs `npm uninstall -g kvman`, and deletes the home folder only when you agree (ADR 0031).

### Patch Changes

- Updated dependencies [134f341]
- Updated dependencies [7574df4]
- Updated dependencies [919540c]
- Updated dependencies [85e9ff8]
- Updated dependencies [b2dc3f9]
  - @kvman/kvbuilder@0.3.0
  - @kvman/kvcoder@0.1.3
  - @kvman/sdk@0.1.1
  - @kvman/kvai@0.1.1
  - @kvman/kvwebui@0.1.1
  - @kvman/kernel@0.2.1

## 0.2.0

### Minor Changes

- The `coder` preset loads `@kvman/kvbuilder`, which replaces `@kvman/kvcustomizer` (ADR 0027): a preset of your own that names the old package must name the new one. To change kvman from a chat, type `/build-kvman` there first.

### Patch Changes

- Updated dependencies [9aaa779]
- Updated dependencies [d1d1fe4]
- Updated dependencies [9aaa779]
  - @kvman/kvbuilder@0.2.0
  - @kvman/kvwebui@0.1.1
  - @kvman/kvcoder@0.1.2
  - @kvman/kvai@0.1.1

## 0.1.1

### Patch Changes

- The README gives the quiet install, `npm i -g kvman --no-fund --loglevel=error`. The kernel follows the root version.
- Updated dependencies [be303fb]
- Updated dependencies
  - @kvman/kvai@0.1.1
  - @kvman/kernel@0.1.1
  - @kvman/kvcoder@0.1.1
  - @kvman/kvcustomizer@0.1.1
  - @kvman/kvwebui@0.1.0

# kvman

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

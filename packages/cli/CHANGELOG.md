# kvman

## 0.4.2

### Patch Changes

- Updated dependencies [9e2439b]
  - @kvman/kvwebui@0.1.4
  - @kvman/kvcoder@0.1.9
  - @kvman/kvbuilder@0.3.3
  - @kvman/kvai@0.1.2

## 0.4.1

### Patch Changes

- Updated dependencies [eb3ee85]
- Updated dependencies [3f2361e]
- Updated dependencies [ca9ff4f]
- Updated dependencies [f23f0b3]
  - @kvman/kvbuilder@0.3.2
  - @kvman/kvcoder@0.1.8
  - @kvman/kvai@0.1.2
  - @kvman/kvwebui@0.1.3

## 0.4.0

### Patch Changes

- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [0616ef9]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [0616ef9]
- Updated dependencies [0616ef9]
- Updated dependencies [f2020ed]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [e8c5e34]
- Updated dependencies [29fa3b1]
- Updated dependencies [0616ef9]
- Updated dependencies [90fb869]
- Updated dependencies [f065303]
- Updated dependencies [046ccd7]
- Updated dependencies [0585f20]
- Updated dependencies [3fc56c4]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [0616ef9]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [0616ef9]
- Updated dependencies [90fb869]
- Updated dependencies [90fb869]
- Updated dependencies [0616ef9]
- Updated dependencies [90fb869]
  - @kvman/sdk@0.1.2
  - @kvman/kvwebui@0.1.3
  - @kvman/kvcoder@0.1.7
  - @kvman/kvai@0.1.2
  - @kvman/kvbuilder@0.3.1
  - @kvman/kernel@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [1515d59]
- Updated dependencies [f3eafb5]
- Updated dependencies [f3eafb5]
  - @kvman/kvcoder@0.1.6
  - @kvman/kvwebui@0.1.2
  - @kvman/kvbuilder@0.3.0

## 0.3.2

### Patch Changes

- Updated dependencies [4b3e5fa]
- Updated dependencies [1dac5fd]
- Updated dependencies [bb26705]
  - @kvman/kvcoder@0.1.5
  - @kvman/kvbuilder@0.3.0

## 0.3.1

### Patch Changes

- Updated dependencies [d2e007d]
- Updated dependencies [bc49671]
- Updated dependencies [19fdbf0]
  - @kvman/kvcoder@0.1.4
  - @kvman/kvbuilder@0.3.0

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

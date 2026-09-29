---
"@kvman/testkit": minor
---

The complete testkit (M2.13, 05 §5.10, ADRs 0165 and 0166): `createTestKernel` runs the real kernel on a temporary home with real hosts, in shared or sandboxed mode, with `asUser({ locale })`, `command` and `query` as the `@kvman/testkit-driver` extension, the event and `ui` recorders, `blobs.put`, `crashDuring`, `idle`, fake processes, and checks for unregistered error codes and missing translations. `fakeProvider(options)` now returns a descriptor that `createTestKernel` places as data; `TestkitProblem` and `TestkitError` are exported.

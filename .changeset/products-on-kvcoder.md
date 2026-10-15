---
'@kvman/kvwebui': minor
'@kvman/kvcoder': minor
'@kvman/kvbuilder': minor
'@kvman/testkit': minor
---

Products on kvcoder, and the fixes from the research build review (ADR 0082): `kvwebui.home` defaults to the Extensions page, so an extension that depends on kvcoder passes its checks; a preset hides developer screens (`kvwebui.nav.hidden` with the built-in pages, `kvwebui.status.hidden`, `kvwebui.workspacePicker`); `kvcoder.profile` gives the agent a product's identity, a short general method, and the Chat page's words; a connector command may show its own `card`; `kvcoder.artifact.write` and `.edit` are public; read-only helpers run other extensions' queries; a chat link from another workspace shows one notice; the new chat's approval note is one plain line and Home is called Home; the scaffold type-checks and starts a Git repository (`GIT_FAILED`); the preview's wrong-kind calls say which call to use; and the builder's guide teaches products for people who aren't developers.

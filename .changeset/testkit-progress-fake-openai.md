---
'@kvman/testkit': patch
---

`exec` and `execAsync` take `onProgress`, which receives the progress chunks of the call's root job. A new subpath, `@kvman/testkit/fake-openai`, starts a scripted OpenAI-compatible streaming server on 127.0.0.1 for LLM tests.

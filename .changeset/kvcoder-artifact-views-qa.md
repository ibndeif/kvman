---
'@kvman/kvcoder': minor
---

The artifact panel has a Preview and Source switch and a Copy button. An artifact written without a format is read from its content: a page that starts with `<!doctype html` or `<html` is shown as a live HTML preview instead of as text, and a lone localhost address is a new `url` artifact, which previews the page running on this machine (a dev server the agent started) in a scripts-only frame, with an Open in a new tab link. Only `localhost` and `127.0.0.1` addresses are accepted, and kvman's own address is never framed.

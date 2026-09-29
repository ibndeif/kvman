# 11 — Bundled presets

Both use bundled extensions only. Their titles are translation keys with `en` and `ar` entries.

| Preset | Extensions | Settings |
|---|---|---|
| `coder` (the default) | kvai, kvwebui, kvcoder | `kvwebui.title`: `kvcoder.app.title` ("kvman Coder"); `kvwebui.home`: `kvcoder.chat`; `kvai.defaultModel`: `anthropic/claude-sonnet-5-5` |
| `dev` | kvai, kvwebui, kvcoder, kvdev | `kvwebui.title`: `kvdev.app.title` ("kvman Dev"); `kvwebui.home`: `kvcoder.chat`; `kvai.defaultModel`: `anthropic/claude-sonnet-5-5`; `kvcoder.shell.approval`: `ask` |

A person's own presets go in `<home>/presets/<name>.json` (§1.2).

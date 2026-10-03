# 11 — Bundled presets

The bundled preset uses bundled extensions only (ADR 0010, 4). Their titles are translation keys with `en` and `ar` entries.

| Preset | Extensions | Settings |
|---|---|---|
| `coder` (the default) | kvai, kvwebui, kvcoder, kvcustomizer | `kvwebui.title`: `kvcoder.app.title` ("kvman Coder"); `kvwebui.home`: `kvcoder.chat`; `kvai.defaultModel`: `anthropic/claude-sonnet-5-5` |

A person's own presets go in `<home>/presets/<name>.json` (§1.2); one named `coder` replaces the bundled one, which is how editing the running preset persists (§2.10, ADR 0010, 4).

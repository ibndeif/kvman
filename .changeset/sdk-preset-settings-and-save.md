---
'@kvman/sdk': minor
---

Three kernel commands: `kernel.preset.settings.set { key, value }` and `kernel.preset.settings.reset { key }` edit one value of the running preset's `settings` in its file (`{ file, restartRequired: true }`, applied at the next start, as `kernel.extensions.install` does), and `kernel.presets.save { preset, replace? }` writes a preset to `<home>/presets/<name>.json` so that `kvman --preset <name>` can start it later (ADR 0030).

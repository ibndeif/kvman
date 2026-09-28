---
"@kvman/protocol": minor
---

Registry answers, preferences, and translation recording (M2.11, ADRs 0159, 0161): `label` on registry items, pages, and settings sections, `def` on composite component entries (never on widgets), the `kernel.ui.*` request and answer schemas (`uiGetRequestSchema`, `uiPageGetRequestSchema`, `uiTranslationsGetRequestSchema`, `uiPageAnswerSchema`, `uiTranslationsAnswerSchema`), the preset label schema shared with `Preset.labels`, the preference schemas (`themePreferenceSchema`, `userPreferencesSchema`, `preferencesGetRequestSchema`, `preferencesSetRequestSchema`, `preferencesSetResultSchema`), and `format: 'kvman-text'` on every `Text` (the UI contract's and the manifest's).

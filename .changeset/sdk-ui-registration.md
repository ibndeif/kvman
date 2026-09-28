---
"@kvman/sdk": minor
---

Add the UI registration API (M2.10 slice A, 05 §5.3, ADR 0156): `ext.registerPage`, `registerNavGroup`, `registerNavItem`, `registerToolbarItem`, `registerStatusItem`, `registerPanel`, `registerSlot`, `registerAction`, `registerRendererTarget`, `registerRenderer`, `registerComponent`, and the once-only `registerSettingsSection`, with the definition shapes of 08 §8.5 and §8.9 (page `params` as a Zod object of flat fields or a map, slot, renderer-target, and component schemas as Zod types converted to JSON Schema).

# ADR 0015 — The configuration pages after their first use

The product owner used the extension pages of ADR 0014 and asked (2026-10-05) for three changes: the default model is chosen from a searchable dropdown, the one the chat has, on every page; the Interface page loses its Navigation and App sections; and binary connectors are connectors, in the same list, with no separation. Decisions 1 to 5 were asked with alternatives and mockups. Decisions 6 to 10 are the smallest way to carry them out; the product owner may overrule any of them.

## Decisions

1. **A model is chosen from a searchable dropdown everywhere** (asked). The chat header's picker (ADR 0009, 136 and 140) is the model: a button with the model's name, a popover with a focused search box, the models under their provider's title, the current one checked, and "N of M models".
2. **kvai and kvcoder each keep their own picker, made to look and behave alike** (asked; chosen over kvai owning one that kvcoder's bundle imports, and over a generic dropdown in kvwebui). There is no new SDK surface and no change to the import walls. kvai's "Change model" popover (ADR 0009, 244) takes the chat's look and rules: every word typed must be in a model's name or id, the current model is checked and is where the highlight starts, the arrows wrap, and a line says "N of M models". Its cap of 100 models and "Keep typing to narrow the list." are removed; it still reads each callable provider on its own, shows a provider's failure, and says "Connect a provider first."
3. **Coder's model offers "Use the default model"** (asked; chosen over the reset link alone). The dropdown's first entry is "Use the default model"; it stores `null`. While `kvcoder.model` is `null` the button shows "Default model (<name>)", with the name of `kvai.defaultModel`, or "Default model" when there is none. The entry is hidden while the person types a search. The chat's picker has no such entry.
4. **Programs aren't added from the UI** (asked; chosen over an inline form and over a dialog). The `kvcoder.connectors` setting leaves kvcoder's configuration. A preset or `kernel.settings.set` still sets it, and its programs are rows of the connectors list like any other.
5. **A connector's row doesn't say where it comes from** (asked; chosen over keeping the chip). Every row is a name, a description, and a switch.
6. **kvwebui's own configuration is one card**, Appearance, with `kvwebui.theme`. `kvwebui.nav.order`, `kvwebui.nav.hidden`, `kvwebui.title`, and `kvwebui.home` stay settings a preset sets, and are no longer shown. This replaces ADR 0014, 12.
7. **A model setting's row is a custom component of its extension**: `kvai.default-model` in kvai's configuration and `kvcoder.model` in kvcoder's, each in place of the `setting` row. It shows the setting's title and description, the dropdown, and what a `setting` row shows about scope (ADR 0013, 2 and 5): it saves into `kvman.scope` with `kernel.settings.set`; a value set in that scope shows "Changed" and a reset (`kernel.settings.reset`); on "All workspaces" while the workspace has its own value the dropdown is disabled and a line says so.
8. **kvai's row** lists the models the "Change model" popover lists, and toasts "The default model is set." With no default its button says "Choose a model". The card keeps its link to the Models page.
9. **kvcoder's row** lists what the chat's picker lists: the models of providers that can be called, and the setting's own model whatever its provider.
10. **A failed change** shows as the extension already shows one: kvai keeps its popover open with the reason; kvcoder toasts the Problem.

## Consequences

- Plan 06 §6.6, plan 07 §7.3, and plan 08 §8.7 are corrected. ADR 0009, 244 and ADR 0014, 10 to 12 are changed by this ADR.
- The catalog keys `kvwebui.config.navigation`, `kvwebui.config.app`, `kvai.ui.picker.narrow`, and `kvcoder.config.connectors.builtin`, `.program`, and `.from` are removed.

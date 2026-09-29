# ADR 0002 — kvwebui (first answers)

Status: accepted, 2026-09-29. The rest of kvwebui is designed in later rounds.

1. **UI form.** Most UI is JSON view trees made of kvwebui's built-in components (page, list, table, form generated from a command's JSON Schema, markdown, a button that runs a command, chat). An extension that needs more ships a compiled Vue component (an ES module) that kvwebui loads by name.
2. **Discovery.** By convention, an extension may register a public query `<namespace>.ui.get` that returns its pages, nav items, and panels. When the browser loads, kvwebui reads `kernel.extensions.list` and calls every `<namespace>.ui.get`. The preset's `ui.*` settings choose, order, and hide what's shown (home page, nav order). Nothing is pushed.
3. **Static files.** kvwebui's app and extensions' Vue bundles are `kvman.web` folders served by the kernel (ADR 0001, 59 and 74). kvwebui's namespace is `ui`.
4. **Stack.** Vue 3 (Composition API, TypeScript), Vite, vue-router, Tailwind CSS with logical properties for right-to-left, and vue-i18n loading `/api/locales/:lang`. No component library.

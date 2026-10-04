# Custom components

This page is for anyone whose extension needs more than the built-in view components. When you finish, you can ship a Vue component, show it on a page, call the kernel from it, and style it so it fits both themes and right-to-left languages.

## Shipping a component

A project scaffolded with `kvman-new --web` has this set up. By hand:

- Put each component in `web/components/<Name>.vue`. A build turns each into `dist/web/components/<name>.js` (and `<name>.css` when it has styles), with `vue` left **external**: kvwebui provides `vue` through an import map.
- Set `"kvman": { "web": "dist/web" }` in `package.json`. The kernel serves that folder at `/web/<namespace>/`.
- Use it in a view as `{ type: 'custom', component: '<namespace>.<name>', props: { … } }`; the name is lowercase kebab case. kvwebui loads `/web/<namespace>/components/<name>.js`, which default-exports the component. The URL carries the extension's `revision`, so after a hot reload a page refresh loads the new code.
- While the module loads, placeholder rows show. A module that can't be loaded, has no default export, or throws an uncaught error shows an error card with `kvwebui/COMPONENT_FAILED` in its place; the rest of the page keeps working.

The scaffold's scripts: `npm run web:build` builds once; `npm run web:watch` rebuilds on every change, and a page refresh then shows it. `kvman-preview` runs `web:watch` for you.

## In the component

```vue
<script setup lang="ts">
import { inject } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

const props = defineProps<{ noteId: string }>();
const kvman = inject<Kvman>('kvman');
</script>
```

`@kvman/sdk/web` is types only. The injected `kvman` object offers:

| Member | Does |
|---|---|
| `exec(name, input)`, `execAsync(name, input)` | Call a public command or query. They reject with a `ProblemError` and show no toast. An `exec` of a command counts as a command the UI ran: the page's queries rerun and its effects apply. |
| `stream(jobId)` | An async iterable of the job's events: `{ type: 'progress', source, data }`, then one `{ type: 'result', output }` or `{ type: 'problem', problem }`. A stream closes when the component unmounts. |
| `follow(jobId)` | Reruns the page's queries and applies the job's effects when the job ends. |
| `refresh()` | Reruns the page's queries and the status items now. |
| `navigate(page, params?)`, `toast(text, params?, level?)`, `panel(id, open)` | Act at once in the browser. |
| `t(key, params?)` | Translates a key. |
| `workspace` | A live ref: `workspace.value` is the tab's `{ id, name, path }`. |
| `View` | A component that renders a view tree: `<component :is="kvman.View" :view="{ type: 'markdown', text }" />`. Use it for Markdown; never `v-html`. |

## Styling

kvwebui's Tailwind classes aren't available to extensions. Use its CSS variables and logical properties:

- colors: `--kv-color-background`, `-surface`, `-text`, `-muted`, `-border`, `-primary`, `-on-primary`, `-danger`, `-warning`, `-success` (light and dark);
- spaces: `--kv-space-sm`, `-md`, `-lg` (8, 16, 24 px); `--kv-radius` (12 px); `--kv-font-mono`;
- `margin-inline`, `padding-block`, `inset-inline-start`, `text-align: start`, so right-to-left languages mirror.

```css
.hello { padding: var(--kv-space-md); border: 1px solid var(--kv-color-border); border-radius: var(--kv-radius); color: var(--kv-color-text); }
```

## Next

- [views.md](views.md)
- [localization.md](localization.md)
- [preview-and-hot-reload.md](preview-and-hot-reload.md)

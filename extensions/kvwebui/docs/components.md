# Custom components (Vue)

When the built-in views aren't enough, an extension ships Vue components. A project scaffolded with `kvman-new --web` (or the `ext new` connector with `"web": true`) has this set up.

- Each `web/components/<Name>.vue` builds on its own into `dist/web/components/<name>.js` and `<name>.css` (`npm run web:build`), with `vue` left external: kvwebui provides it through an import map.
- `package.json` has `"kvman": { "web": "dist/web" }`, and the kernel serves that folder at `/web/<namespace>/`.
- A view uses it as `{ type: 'custom', component: '<namespace>.<name>', props: { … } }`; the name is lowercase kebab case.
- `npm run web:watch` rebuilds on every change; a page refresh shows the new code. The preview runs `web:watch` for you.

## In the component

```vue
<script setup lang="ts">
import { inject } from 'vue';
import type { Kvman } from '@kvman/sdk/web';

const props = defineProps<{ noteId: string }>();
const kvman = inject<Kvman>('kvman');
</script>
```

The injected `kvman` object offers:
- `exec(name, input)` and `execAsync(name, input)`: they reject with a `ProblemError` and show no toast. An `exec` of a command reruns the page's queries.
- `stream(jobId)`: the job's events, `{ type: 'progress', source, data }`, then `{ type: 'result', output }` or `{ type: 'problem', problem }`.
- `follow(jobId)`, `navigate(page, params?)`, `toast(text, params?, level?)`, `panel(id, open)`.
- `t(key, params?)` translates; `workspace.value` is `{ id, name, path }`.
- `View`, a component that renders a view tree: use `<component :is="kvman.View" :view="{ type: 'markdown', text }" />` for Markdown; never `v-html`.

## Styling

Use kvwebui's CSS variables and logical properties only (kvwebui's Tailwind classes aren't available):
- colors `--kv-color-background`, `-surface`, `-text`, `-muted`, `-border`, `-primary`, `-on-primary`, `-danger`, `-warning`, `-success`;
- spaces `--kv-space-sm`, `-md`, `-lg` (8, 16, 24 px), `--kv-radius` (12 px), and `--kv-font-mono`;
- `margin-inline`, `padding-block`, `inset-inline-start`, and `text-align: start`, so right-to-left languages work.

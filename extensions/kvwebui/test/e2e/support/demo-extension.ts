import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The `demo` fixture extension for Chromium: a page with two custom components, plain ES modules that import `vue` (as
// a component built with `vue` external would): `demo.progress`, with a CSS file, starts `demo.count` with `execAsync`,
// shows its stream, releases it, and renders Markdown through `View`; `demo.plain` has no CSS file.

const entry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  const custom = (component: string, props: Record<string, string>) => ({ type: 'custom', component, props });
  const ui = {
    pages: [{ id: 'progress', title: 'demo.page', view: { type: 'stack', direction: 'vertical', children: [custom('demo.progress', { title: 'demo.title' }), custom('demo.plain', {})] } }],
    nav: [],
    panels: [],
    status: [],
  };
  const empty = { input: z.object({}), public: true };
  ctx.registerQuery('demo.ui.get', { description: 'Gives the demo page.', ...empty, output: z.unknown(), handle: () => ui });
  ctx.registerCommand('demo.count', { description: 'Sends a chunk every 50 ms until released.', ...empty, output: z.object({ total: z.number() }),
    handle: async () => {
      let total = 0;
      while ((await ctx.store.global.kv.get('released')) === undefined && !ctx.job.signal.aborted) {
        total += 1;
        ctx.job.progress({ n: total });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { total };
    } });
  ctx.registerCommand('demo.release', { description: 'Releases demo.count.', ...empty, output: z.object({}),
    handle: async () => { await ctx.store.global.kv.set('released', true); return {}; } });
};
`;

const progress = `import { defineComponent, h, inject, ref } from 'vue';

export default defineComponent({
  props: { title: { type: String, required: true } },
  setup(props) {
    const kvman = inject('kvman');
    const chunks = ref([]);
    const result = ref('');
    const start = async () => {
      const jobId = await kvman.execAsync('demo.count', {});
      for await (const event of kvman.stream(jobId)) {
        if (event.type === 'progress') chunks.value.push(event.data.n);
        else result.value = event.type === 'result' ? 'total ' + event.output.total : event.problem.code;
      }
    };
    return () => h('section', { class: 'demo-progress', 'data-test': 'demo-progress' }, [
      h('h2', kvman.t(props.title)),
      h('button', { onClick: start }, 'Start'),
      h('button', { onClick: () => kvman.exec('demo.release', {}) }, 'Release'),
      h('ol', { 'data-test': 'chunks' }, chunks.value.map((n) => h('li', String(n)))),
      h('output', { 'data-test': 'result' }, result.value),
      h(kvman.View, { view: { type: 'markdown', text: 'demo.done' } }),
    ]);
  },
});
`;

const progressCss = `.demo-progress {
  border: 2px solid var(--kv-color-primary);
  background: var(--kv-color-surface);
  color: var(--kv-color-text);
  padding: var(--kv-space-md);
  border-radius: var(--kv-radius);
}
`;

const plain = `import { defineComponent, h } from 'vue';

export default defineComponent({ render: () => h('p', { 'data-test': 'demo-plain' }, 'plain') });
`;

const catalogs = {
  en: { 'demo.page': 'Demo', 'demo.title': 'Counting', 'demo.done': '**done**' },
  ar: { 'demo.page': 'تجربة', 'demo.title': 'العدّ', 'demo.done': '**تم**' },
};

export function writeDemo(root: string): void {
  const demo = path.join(root, 'demo');
  for (const folder of ['locales', 'web/components']) mkdirSync(path.join(demo, folder), { recursive: true });
  const manifest = { name: '@test/demo', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'demo', source: 'index.ts', web: 'web' } };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(manifest),
    'index.ts': entry,
    'web/components/progress.js': progress,
    'web/components/progress.css': progressCss,
    'web/components/plain.js': plain,
    ...Object.fromEntries(Object.entries(catalogs).map(([language, catalog]) => [`locales/${language}.json`, JSON.stringify(catalog)])),
  };
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(demo, name), text);
}

import { computed, defineComponent, h, provide, ref } from 'vue';
import type { Scope } from '../../../web/src/contributions/references.ts';
import { viewScopeKey } from '../../../web/src/contributions/references.ts';
import { custom, customApi, useKvman } from './custom-page.ts';
import { createFakeComponents } from './fake-components.ts';
import { mountApp } from './mount-app.ts';

// Pages for the OpenUI tests (plan 06 §6.1, ADR 0124): a custom component showing `kvman.View` with an `openui` view,
// or with a Markdown view whose text a test grows line by line.

/** The page of an `openui` view of `source`, with `onMessage` when one is given, to answer its calls before mounting. */
export function openuiPage(source: string, onMessage?: (text: string) => void) {
  const components = createFakeComponents();
  components.define(
    'notes.openui',
    defineComponent({
      setup: () => {
        const kvman = useKvman();
        return () => h(kvman.View, { view: { type: 'openui', source }, ...(onMessage === undefined ? {} : { onMessage }) });
      },
    }),
  );
  return { api: customApi(custom('notes.openui')), components };
}

/** Mounts an `openui` view of `source`, with `onMessage` when one is given. */
export async function mountOpenui(source: string, onMessage?: (text: string) => void) {
  const { api, components } = openuiPage(source, onMessage);
  const app = await mountApp(api, '/notes/custom', components);
  return { api, app };
}

/** A Markdown view whose text the test sets, with `onMessage` when one is given; mount it with `mountApp(api, '/notes/custom', components)`. */
export function markdownPage(onMessage?: (text: string) => void) {
  const text = ref('');
  const scope = computed<Scope>(() => ({ params: { body: text.value } }));
  const components = createFakeComponents();
  components.define(
    'notes.streamer',
    defineComponent({
      setup: () => {
        provide(viewScopeKey, scope);
        const kvman = useKvman();
        const view = { type: 'markdown' as const, text: 'notes.streamed', params: { body: { $param: 'body' } } };
        return () => h(kvman.View, { view, ...(onMessage === undefined ? {} : { onMessage }) });
      },
    }),
  );
  const api = customApi(custom('notes.streamer'));
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.streamed': '{body}' };
  return { text, api, components };
}

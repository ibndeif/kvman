import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { custom, customApi, notesTable, stack } from './support/custom-page.ts';
import { extension, mountApp } from './support/mount-app.ts';
import { notesExtension } from './support/notes.ts';
import { createFakeComponents } from './support/fake-components.ts';

const showing = (tag: string) => defineComponent({ inheritAttrs: false, setup: (_props, { attrs }) => () => h('p', { 'data-test': tag }, JSON.stringify(attrs)) });
const page = (view: Json) => ({ id: 'p', title: 'notes.pages.list', view });
const answer = (view: Json) => ({ pages: [page(view)], nav: [], panels: [], status: [] });

describe('custom components (06 §6.4, ADR 0009, 82–84)', () => {
  it("M2.3-E1 a custom view is checked when the answer loads", async () => {
    const api = customApi(stack(custom('notes.chart'), custom('other.card')));
    api.extensions.push(extension('other'), extension('ghosty'), extension('upper'), extension('bare'), extension('params'));
    api.handlers.set('other.ui.get', () => ({ pages: [], nav: [], panels: [], status: [] }));
    api.handlers.set('ghosty.ui.get', () => answer(custom('ghost.card')));
    api.handlers.set('upper.ui.get', () => answer(custom('Notes.Chart')));
    api.handlers.set('bare.ui.get', () => answer(custom('notes')));
    api.handlers.set('params.ui.get', () => answer(custom('notes.chart', { id: { $param: 'id' } })));
    const components = createFakeComponents();
    components.define('notes.chart', showing('chart'));
    components.define('other.card', showing('card'));
    const app = await mountApp(api, '/notes/custom', components);
    expect(app.find('[data-test="chart"]')).not.toBeNull();
    expect(app.find('[data-test="card"]')).not.toBeNull();
    for (const namespace of ['ghosty', 'upper', 'bare']) {
      const card = app.find(`[data-test="load-failure-${namespace}"]`);
      expect(card?.querySelector('[data-test="problem-code"]')?.textContent, namespace).toBe('VALIDATION_FAILED');
      expect(card?.textContent, namespace).toContain('pages.0.view.component');
    }
    expect(app.find('[data-test="load-failure-params"]')?.textContent).toContain('The param \\"id\\" isn');
    expect([...app.state.registry.value.pages.keys()]).toEqual(['notes.custom', 'notes.note']);
  });

  it('M2.3-E2 props resolve $param and $row references', async () => {
    const api = customApi(stack(custom('notes.item', { id: { $param: 'id' }, fixed: 3 }), { type: 'list', query: 'notes.note.list', input: {}, item: custom('notes.row', { name: { $row: 'title' } }) }), ['id']);
    const components = createFakeComponents();
    components.define('notes.item', showing('item'));
    components.define('notes.row', showing('row'));
    const app = await mountApp(api, '/notes/custom/7', components);
    expect(app.find('[data-test="item"]')?.textContent).toBe('{"id":"7","fixed":3}');
    expect(app.findAll('[data-test="row"]').map((row) => row.textContent)).toEqual(['{"name":"First"}', '{"name":"Second"}', '{"name":"Third"}']);
  });

  it('M2.3-E3 the module and its CSS load once, with the revision in their URLs', async () => {
    const api = customApi(stack(custom('notes.chart'), custom('notes.chart')));
    api.extensions.splice(0, 1, { ...notesExtension(), revision: 4 });
    const components = createFakeComponents();
    components.define('notes.chart', showing('chart'));
    const app = await mountApp(api, '/notes/custom', components);
    expect(components.requested).toEqual(['/web/notes/components/chart.js?revision=4', '/web/notes/components/chart.css?revision=4']);
    expect(app.findAll('[data-test="chart"]')).toHaveLength(2);
  });

  it("M2.3-E4 a component that can't load or throws shows COMPONENT_FAILED, and the rest of the page works", async () => {
    const api = customApi(stack({ type: 'heading', text: 'notes.pages.list', level: 1 }, custom('notes.missing'), custom('notes.bare'), custom('notes.throws'), custom('notes.slow'), notesTable));
    const components = createFakeComponents();
    components.modules.set('notes.bare', () => Promise.resolve({}));
    components.define('notes.throws', defineComponent({ setup: () => { throw new Error('broken on purpose'); } }));
    let finish: (module: unknown) => void = () => undefined;
    components.modules.set('notes.slow', () => new Promise((resolve) => (finish = resolve)));
    const app = await mountApp(api, '/notes/custom', components);
    expect(app.find('h1')?.textContent).toBe('Notes');
    expect(app.findAll('[data-test="table-row"]')).toHaveLength(3);
    for (const [component, message] of [['notes.missing', "chart.js couldn't"], ['notes.bare', 'has no default export'], ['notes.throws', 'broken on purpose']] as const) {
      const card = app.find(`[data-test="component-failed-${component}"]`);
      expect(card?.textContent, component).toContain(`The part “${component}” couldn't be shown.`);
      expect(card?.querySelector('[data-test="problem-code"]')?.textContent, component).toBe('kvwebui/COMPONENT_FAILED');
      expect(card?.textContent, component).toContain(message.replace('chart', component.split('.')[1] ?? ''));
      expect(card?.querySelector('button'), component).toBeNull();
    }
    expect(app.findAll('[data-test="loading"]')).toHaveLength(1);
    finish({ default: showing('slow') });
    await app.settle();
    expect(app.find('[data-test="slow"]')).not.toBeNull();
    expect(app.find('[data-test="loading"]')).toBeNull();
  });
});

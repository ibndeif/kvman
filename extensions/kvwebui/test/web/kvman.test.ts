import { ProblemError } from '@kvman/sdk';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { fail } from './support/fake-api.ts';
import { custom, customApi, notesTable, stack, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { button, click, mountApp } from './support/mount-app.ts';

// A fixture component: one button per action, and the last result in an `<output>`.
function actions(list: Record<string, (kvman: ReturnType<typeof useKvman>) => unknown>) {
  return defineComponent({
    setup: () => {
      const kvman = useKvman();
      const shown = ref('');
      const run = (action: (kvman: ReturnType<typeof useKvman>) => unknown) => async () => {
        shown.value = await Promise.resolve(action(kvman)).then(
          (value) => JSON.stringify(value ?? null),
          (error: unknown) => (error instanceof ProblemError ? `ProblemError ${error.problem.code}` : String(error)),
        );
      };
      return () => h('div', [...Object.entries(list).map(([name, action]) => h('button', { onClick: run(action) }, name)), h('output', { 'data-test': 'shown' }, shown.value)]);
    },
  });
}

async function mountActions(list: Parameters<typeof actions>[0], api = customApi(stack(custom('notes.actions'), notesTable))) {
  const components = createFakeComponents();
  components.define('notes.actions', actions(list));
  return { api, app: await mountApp(api, '/notes/custom', components) };
}

const toasts = (app: Awaited<ReturnType<typeof mountActions>>['app']) => app.state.toasts.list.map((toast) => `${toast.level}:${toast.text}`);

describe('the injected kvman (06 §6.4, ADR 0009, 83)', () => {
  it("M2.3-H2 a component's navigate, toast, and panel act at once", async () => {
    const { api, app } = await mountActions({
      toast: (kvman) => kvman.toast('notes.saved', { name: 'x' }, 'success'),
      panel: (kvman) => kvman.panel('notes.help', true),
      navigate: (kvman) => kvman.navigate('notes.note', { noteId: '7' }),
    });
    const calls = api.calls.length;
    await click(button(app, 'toast'));
    expect(app.find('[data-level="success"]')?.textContent).toContain('Saved x.');
    await click(button(app, 'panel'));
    expect(app.find('[data-test="panel-notes.help"]')).not.toBeNull();
    expect(sessionStorage.getItem('kvwebui.panel')).toBe('notes.help');
    await click(button(app, 'navigate'));
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/note/7');
    expect(app.text()).toContain('Showing note 7');
    expect(api.calls.slice(calls)).toEqual([]);
  });

  it('M2.3-E6 exec of a command reruns queries and applies effects; of a query, neither; a failure rejects without a toast', async () => {
    const { api, app } = await mountActions({
      add: (kvman) => kvman.exec('notes.note.add', {}),
      count: (kvman) => kvman.exec('notes.count.get', {}),
      bad: (kvman) => kvman.exec('notes.bad', {}),
    });
    api.handlers.set('notes.note.add', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.first', level: 'info' });
      return { id: 'n9' };
    });
    api.handlers.set('notes.bad', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.after', level: 'warning' });
      return fail('notes/NOPE');
    });
    const runs = (name: string) => api.callsTo(name).length;
    const takes = () => api.callsTo('kvwebui.effect.take').map((call) => (call.input as { jobId: string }).jobId);

    const lists = runs('notes.note.list');
    await click(button(app, 'add'));
    expect(app.find('[data-test="shown"]')?.textContent).toBe('{"id":"n9"}');
    expect(runs('notes.note.list')).toBe(lists + 1);
    expect(takes()).toEqual([api.callsTo('notes.note.add')[0]?.jobId]);
    expect(toasts(app)).toEqual(['info:notes.first']);

    await click(button(app, 'count'));
    expect(app.find('[data-test="shown"]')?.textContent).toBe('{"count":3}');
    expect(api.callsTo('notes.count.get').at(-1)?.kind).toBe('queries');
    expect(runs('notes.note.list')).toBe(lists + 1);
    expect(takes()).toHaveLength(1);

    await click(button(app, 'bad'));
    expect(app.find('[data-test="shown"]')?.textContent).toBe('ProblemError notes/NOPE');
    expect(takes()).toEqual([api.callsTo('notes.note.add')[0]?.jobId, api.callsTo('notes.bad')[0]?.jobId]);
    expect(toasts(app)).toEqual(['info:notes.first', 'warning:notes.after']);
  });

  it('M2.3-E10 workspace is a live ref', async () => {
    const api = customApi(custom('notes.where'));
    api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' });
    let setups = 0;
    const components = createFakeComponents();
    components.define(
      'notes.where',
      defineComponent({
        setup: () => {
          setups += 1;
          const kvman = useKvman();
          return () => h('p', { 'data-test': 'where' }, `${kvman.workspace.value.id}:${kvman.workspace.value.name}`);
        },
      }),
    );
    const app = await mountApp(api, '/notes/custom', components);
    expect(app.find('[data-test="where"]')?.textContent).toBe('home:ahmed');
    await click(app.find('button[aria-label^="Workspace:"]'));
    await click(app.find('[data-test="workspace-w1"]'));
    expect(app.find('[data-test="where"]')?.textContent).toBe('w1:project');
    expect(setups).toBe(1);
  });

  it('M2.3-E11 toast defaults to info; an unknown panel does nothing; an unknown page shows "page not found"', async () => {
    const { app } = await mountActions({
      toast: (kvman) => kvman.toast('notes.hello'),
      panel: (kvman) => kvman.panel('ghost.help', true),
      navigate: (kvman) => kvman.navigate('ghost.page'),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click(button(app, 'toast'));
    expect(app.find('[data-level="info"]')?.textContent).toContain('Hello.');
    vi.advanceTimersByTime(5000);
    await app.settle();
    expect(app.find('[data-level="info"]')).toBeNull();
    await click(button(app, 'panel'));
    expect(app.state.panel.value).toBeNull();
    expect(app.find('[data-test^="panel-notes"], [data-test^="panel-ghost"]')).toBeNull();
    await click(button(app, 'navigate'));
    expect(app.router.currentRoute.value.fullPath).toBe('/ghost/page');
    expect(app.find('[data-test="not-found"]')).not.toBeNull();
  });

  it("QA2-H1 refresh reruns the page's queries now, and runs no command", async () => {
    const { api, app } = await mountActions({ refresh: (kvman) => kvman.refresh() });
    const lists = api.callsTo('notes.note.list').length;
    const commands = api.calls.filter((call) => call.kind === 'commands').length;
    await click(button(app, 'refresh'));
    expect(api.callsTo('notes.note.list').length).toBe(lists + 1);
    expect(api.calls.filter((call) => call.kind === 'commands').length).toBe(commands);
  });
});

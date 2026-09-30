import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { customApi, notesTable, stack } from './support/custom-page.ts';
import { button, click, mountApp } from './support/mount-app.ts';

const done = { type: 'button', text: 'notes.done', command: 'notes.note.create', input: {}, then: { toast: 'notes.done' } };
const lock = { type: 'button', text: 'notes.lockIt', command: 'notes.lock', input: {} };

function effectsApi() {
  const api = customApi(stack(notesTable, done, lock));
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.lockIt': 'Lock' };
  return api;
}

const toasts = (app: Awaited<ReturnType<typeof mountApp>>) => app.state.toasts.list.map((toast) => `${toast.level}:${toast.text}`);

describe("effects in the UI (06 §6.5, ADR 0009, 86)", () => {
  it('M2.3-H6 the UI applies a job\'s effects once, when its job ends', async () => {
    const api = effectsApi();
    api.handlers.set('notes.note.create', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.first', level: 'info' });
      job.addEffect({ type: 'panel', panel: 'notes.help', open: true });
      return { id: 'n7' };
    });
    const app = await mountApp(api, '/notes/custom');
    await click(button(app, 'Done.'));
    const jobId = api.callsTo('notes.note.create')[0]?.jobId;
    expect(api.callsTo('kvwebui.effect.take').map((call) => call.input)).toEqual([{ jobId }]);
    expect(toasts(app).filter((toast) => toast === 'info:notes.first')).toHaveLength(1);
    expect(app.find('[data-test="panel-notes.help"]')).not.toBeNull();
  });

  it("M2.3-E13 a button's or form's effects come after then or the error toast, in order", async () => {
    const api = effectsApi();
    api.handlers.set('notes.note.create', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.first', level: 'info' });
      job.addEffect({ type: 'refresh' });
      job.addEffect({ type: 'navigate', page: 'notes.note', params: { noteId: '2' } });
      return { id: 'n7' };
    });
    api.handlers.set('notes.lock', (_input, _workspace, job) => {
      job.addEffect({ type: 'toast', text: 'notes.after', level: 'warning' });
      return fail('notes/NOPE');
    });
    const app = await mountApp(api, '/notes/custom');
    await click(button(app, 'Lock'));
    expect(toasts(app)).toEqual(['error:notes.errors.NOPE', 'warning:notes.after']);
    app.state.toasts.list.map((toast) => toast.id).forEach((id) => app.state.toasts.close(id));

    const lists = api.callsTo('notes.note.list').length;
    await click(button(app, 'Done.'));
    expect(toasts(app)).toEqual(['success:notes.done', 'info:notes.first']);
    expect(api.callsTo('notes.note.list').length).toBe(lists + 2);
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/note/2');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fail } from './support/fake-api.ts';
import { button, click, mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const remove = { type: 'button', text: 'notes.delete', command: 'notes.note.delete', input: { id: { $row: 'id' } }, confirm: 'notes.deleteConfirm', style: 'danger' };
const done = { type: 'button', text: 'notes.done', command: 'notes.note.create', input: {}, then: { toast: 'notes.done' } };
const lock = { type: 'button', text: 'notes.lockIt', command: 'notes.lock', input: {} };
const view = {
  type: 'stack',
  direction: 'vertical',
  children: [{ type: 'table', query: 'notes.note.list', input: {}, columns: [{ field: 'title', title: 'notes.columns.title' }], rowActions: [remove] }, done, lock],
};

describe('buttons and toasts (06 §6.4, §6.7, ADR 0009, 75)', () => {
  it('M2.2-E10 a confirmation guards a row action, commands rerun the queries, and toasts close or stay by level', async () => {
    const api = notesApi({ ui: notesUi({ pages: [{ id: 'list', title: 'notes.pages.list', view }] }) });
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.delete': 'Delete', 'notes.deleteConfirm': 'Delete this note?', 'notes.lockIt': 'Lock' };
    api.handlers.set('notes.lock', () => fail('notes/LOCKED', { name: 'Report' }));
    const app = await mountApp(api, '/notes/list');
    const listRuns = () => api.callsTo('notes.note.list').length;
    const countRuns = () => api.callsTo('notes.count.get').length;

    await click(app.findAll('[data-test="table-row"]')[0]?.querySelector('button') ?? null);
    expect(document.body.textContent).toContain('Delete this note?');
    await click(document.querySelector<HTMLElement>('[data-test="confirm-cancel"]'));
    expect(api.callsTo('notes.note.delete')).toEqual([]);

    const [lists, counts] = [listRuns(), countRuns()];
    await click(app.findAll('[data-test="table-row"]')[0]?.querySelector('button') ?? null);
    await click(document.querySelector<HTMLElement>('[data-test="confirm-ok"]'));
    expect(api.callsTo('notes.note.delete').map((call) => call.input)).toEqual([{ id: 'n1' }]);
    expect(listRuns()).toBe(lists + 1);
    expect(countRuns()).toBe(counts + 1);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click(button(app, 'Done.'));
    expect(app.find('[data-level="success"]')?.textContent).toContain('Done.');
    await click(button(app, 'Lock'));
    expect(app.find('[data-level="error"]')?.textContent).toContain('Report is locked.');
    vi.advanceTimersByTime(5000);
    await app.settle();
    expect(app.find('[data-level="success"]')).toBeNull();
    expect(app.find('[data-level="error"]')).not.toBeNull();
    vi.advanceTimersByTime(60_000);
    await app.settle();
    expect(app.find('[data-level="error"]')).not.toBeNull();
  });
});

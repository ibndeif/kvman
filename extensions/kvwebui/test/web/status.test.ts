import { describe, expect, it, vi } from 'vitest';
import { fail } from './support/fake-api.ts';
import { button, click, mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const done = { type: 'button', text: 'notes.done', command: 'notes.note.create', input: {} };

describe('the status bar (06 §6.2–§6.3, ADR 0009, 69, 73)', () => {
  it('M2.2-E4 status items rerun after commands and every 30 s, show $output, mark failures, and health goes offline', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = notesApi({ ui: notesUi({ pages: [{ id: 'list', title: 'notes.pages.list', view: done }] }) });
    const health = api.handlers.get('kernel.health.get');
    const app = await mountApp(api, '/notes/list');
    const runs = () => api.callsTo('notes.count.get').length;
    const item = () => app.find('[data-test="status-notes.count"]');
    expect(item()?.textContent).toBe('3 notes');
    const first = runs();
    await click(button(app, 'Done.'));
    expect(runs()).toBe(first + 1);
    vi.advanceTimersByTime(30_000);
    await app.settle();
    expect(runs()).toBe(first + 2);

    api.handlers.set('notes.count.get', () => fail('notes/DOWN'));
    vi.advanceTimersByTime(30_000);
    await app.settle();
    expect(item()?.getAttribute('title')).toBe('Notes are down.');
    expect(item()?.querySelector('svg')).not.toBeNull();

    api.handlers.set('kernel.health.get', () => fail('NOT_FOUND'));
    vi.advanceTimersByTime(30_000);
    await app.settle();
    expect(app.find('[data-test="health"]')?.textContent).toBe('offline');
    if (health !== undefined) api.handlers.set('kernel.health.get', health);
    vi.advanceTimersByTime(30_000);
    await app.settle();
    expect(app.find('[data-test="health"]')?.textContent).toBe('kvman 0.1.0');
  });
});

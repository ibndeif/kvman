import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

// A status item's count at the start of the tab's title (06 §6.3, ADR 0091, 7).
afterEach(() => {
  vi.useRealTimers();
});

const uncounted = { id: 'count', query: 'notes.count.get', input: {}, text: 'notes.status.count', params: { count: { $output: 'count' } }, order: 1 };
const counted = { id: 'count', query: 'notes.count.get', input: {}, text: 'notes.status.count', params: { count: { $output: 'count' } }, order: 1, titleCount: 'count' };

describe("the tab's title count (ADR 0091, 7)", () => {
  it('QA59-H14 a status item with titleCount starts the title with its number, and with 0 it does not', async () => {
    const api = notesApi({ ui: notesUi({ status: [counted] }) });
    api.handlers.set('notes.count.get', () => ({ count: 2 }));
    const app = await mountApp(api, '/notes/list');
    expect(document.title).toMatch(/^\(2\) /);
    app.app.unmount();
    const none = notesApi({ ui: notesUi({ status: [counted] }) });
    none.handlers.set('notes.count.get', () => ({ count: 0 }));
    const quiet = await mountApp(none, '/notes/list');
    expect(document.title).not.toMatch(/^\(/);
    quiet.app.unmount();
  });

  it('QA59-H14 an item without titleCount leaves the title as it is', async () => {
    const api = notesApi({ ui: notesUi() });
    const app = await mountApp(api, '/notes/list');
    expect(document.title).not.toMatch(/^\(/);
    app.app.unmount();
  });

  it('M4.8-H9 an item whose count is 0 is not shown, and shows again when its count rises', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = notesApi({ ui: notesUi({ status: [counted] }) });
    api.handlers.set('notes.count.get', () => ({ count: 0 }));
    const app = await mountApp(api, '/notes/list');
    expect(app.find('[data-test="status-notes.count"]')).toBeNull();
    expect(app.find('[data-test="status-bar"]')?.textContent).not.toContain('notes');
    api.handlers.set('notes.count.get', () => ({ count: 2 }));
    vi.advanceTimersByTime(30_000);
    await app.settle();
    expect(app.find('[data-test="status-notes.count"]')?.textContent).toBe('2 notes');
    app.app.unmount();
  });

  it("M4.8-E5 an item without titleCount, or whose count field isn't in the output, keeps showing", async () => {
    const plain = notesApi({ ui: notesUi({ status: [uncounted] }) });
    plain.handlers.set('notes.count.get', () => ({ count: 0 }));
    const first = await mountApp(plain, '/notes/list');
    expect(first.find('[data-test="status-notes.count"]')?.textContent).toBe('0 notes');
    first.app.unmount();
    const missing = notesApi({ ui: notesUi({ status: [{ ...counted, titleCount: 'waiting' }] }) });
    missing.handlers.set('notes.count.get', () => ({ count: 0 }));
    const second = await mountApp(missing, '/notes/list');
    expect(second.find('[data-test="status-notes.count"]')?.textContent).toBe('0 notes');
    second.app.unmount();
  });
});

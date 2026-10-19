import { describe, expect, it } from 'vitest';
import { mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

// A status item's count at the start of the tab's title (06 §6.3, ADR 0091, 7).
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
});

import { describe, expect, it } from 'vitest';
import { setting } from './support/fake-api.ts';
import { mountApp } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

describe('a preset hides status items (06 §6.2, ADR 0082, 12)', () => {
  it('QA52-H13 a contributed item named in kvwebui.status.hidden, and the folder as kvwebui.folder, are not shown; the version is', async () => {
    const shown = await mountApp(notesApi(), '/notes/list');
    expect(shown.find('[data-test="status-notes.count"]')).not.toBeNull();
    expect(shown.find('[data-test="status-workspace"]')).not.toBeNull();

    const api = notesApi();
    api.settings.push(setting('kvwebui.status.hidden', { type: 'array', items: { type: 'string' } }, [], { preset: ['notes.count', 'kvwebui.folder'] }));
    const app = await mountApp(api, '/notes/list');
    expect(app.find('[data-test="status-notes.count"]')).toBeNull();
    expect(app.find('[data-test="status-workspace"]')).toBeNull();
    expect(app.find('[data-test="status-bar"]')?.textContent).toContain('0.1.0');
  });
});

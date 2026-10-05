import { describe, expect, it } from 'vitest';
import { click, extension, mountApp, type } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

describe('the Extensions page (06 §6.6, ADR 0009, 78)', () => {
  it('M2.2-E13 cards show the source and counts, open to list calls with translated or English descriptions, and search filters', async () => {
    const api = notesApi();
    const remote = extension('remote', { commands: [{ name: 'remote.sync.run' }] }, 'npm:1.2.3');
    const local = { ...extension('local', {}, 'path:../local'), settings: [{ key: 'local.mode', description: 'How local works.', scopes: ['global' as const] }], handlers: [{ point: 'kernel.started', description: 'Registers local things.' }] };
    api.extensions.push(remote, local);
    for (const namespace of ['remote', 'local']) api.handlers.set(`${namespace}.ui.get`, () => ({ pages: [], nav: [], panels: [], status: [] }));
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.note.add.description': 'Adds a note to a folder.' };
    const app = await mountApp(api, '/kvwebui/extensions');
    const card = (namespace: string) => app.find(`[data-test="extension-${namespace}"]`);
    expect(['notes', 'remote', 'local'].map((namespace) => card(namespace)?.querySelector('[data-test="extension-source"]')?.textContent)).toEqual(['Bundled', 'npm', 'Local folder']);
    expect(card('notes')?.textContent).toContain('Commands 4');
    expect(card('notes')?.textContent).toContain('Queries 5');
    expect(card('notes')?.querySelector('[data-test="extension-call"]')).toBeNull();
    await click(card('notes')?.querySelector('button') ?? null);
    const calls = [...(card('notes')?.querySelectorAll<HTMLElement>('[data-test="extension-call"]') ?? [])];
    const add = calls.find((call) => call.textContent.includes('notes.note.add'));
    expect(add?.textContent).toContain('Adds a note to a folder.');
    expect(add?.textContent).toContain('Public');
    const secret = calls.find((call) => call.textContent.includes('notes.secret.get'));
    expect(secret?.textContent).toContain('The English description of notes.secret.get.');
    expect(secret?.textContent).not.toContain('Public');
    await click(card('local')?.querySelector('button') ?? null);
    expect(card('local')?.textContent).toContain('How local works.');
    expect(card('local')?.textContent).toContain('kernel.started');
    await type(app.find('[data-test="extensions-search"]'), 'add');
    expect(app.findAll('[data-test="extension-call"]').map((call) => call.querySelector('span')?.textContent)).toEqual(['notes.note.add']);
  });

  it('QA20-E10 names keep their direction: an extension name, its version, and a call name are left to right', async () => {
    const app = await mountApp(notesApi(), '/kvwebui/extensions');
    const card = app.find('[data-test="extension-notes"]');
    expect([card?.querySelector('[data-test="extension-name"]')?.textContent, card?.querySelector('[data-test="extension-name"]')?.getAttribute('dir')]).toEqual(['@test/notes', 'ltr']);
    expect(card?.querySelector('[data-test="extension-version"]')?.getAttribute('dir')).toBe('ltr');
    await click(card?.querySelector('button') ?? null);
    const names = [...(card?.querySelectorAll<HTMLElement>('[data-test="call-name"]') ?? [])];
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => name.getAttribute('dir') !== 'ltr')).toEqual([]);
    expect(app.find<HTMLInputElement>('[data-test="add-name"]')?.dir).toBe('ltr');
  });
});

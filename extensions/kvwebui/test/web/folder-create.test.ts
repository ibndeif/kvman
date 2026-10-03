import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { deferred, dialog, entries, folderApi, go, holdFolders, lastCrumb, listingOf, openDialog } from './support/folder-fake.ts';
import { click, mountApp, settle, type } from './support/mount-app.ts';

async function makeFolder(name: string): Promise<void> {
  await type(dialog('[data-test="folder-new-name"]'), name);
  dialog('[data-test="folder-new-name"]')?.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
}

describe('making a folder in the folder browser (06 §6.2, ADR 0009, 222 and 223)', () => {
  it('QA14-H12 New folder asks for a name, makes the folder, goes into it, and the parent lists it', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/a');
    expect(dialog('[data-test="folder-new-row"]')).toBeNull();
    await click(dialog('[data-test="folder-new"]'));
    expect(dialog('[data-test="folder-new-row"]')).not.toBeNull();
    expect(document.activeElement).toBe(dialog('[data-test="folder-new-name"]'));
    await makeFolder('fresh');
    expect(api.callsTo('kernel.folder.create').map((call) => call.input)).toEqual([{ path: '/a', name: 'fresh' }]);
    expect(lastCrumb()).toBe('fresh');
    expect(dialog('[data-test="folder-new-row"]')).toBeNull();
    expect(dialog('[data-test="folder-empty"]')?.textContent).toBe('No folders here.');
    await click(dialog('[data-test="folder-up"]'));
    expect(lastCrumb()).toBe('a');
    expect(entries()).toEqual(['b', 'c', 'fresh']);
  });

  it("QA14-E6 making a folder forgets its parent's cached listing, so Up does not show the old one", async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/a');
    expect(entries()).toEqual(['b', 'c']);
    await click(dialog('[data-test="folder-new"]'));
    await makeFolder('fresh');
    const gate = deferred<Json>();
    holdFolders(api, (path) => (path === '/a' ? gate.promise : undefined));
    await click(dialog('[data-test="folder-up"]'));
    expect(lastCrumb()).toBe('fresh');
    gate.resolve(listingOf('/a', '/', ['b', 'c', 'fresh']));
    await settle();
    expect(lastCrumb()).toBe('a');
    expect(entries()).toEqual(['b', 'c', 'fresh']);
  });

  it('QA14-E7 a refused name shows why, keeps the row and the typed name, and the browser stays where it was', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/a');
    await click(dialog('[data-test="folder-new"]'));
    api.handlers.set('kernel.folder.create', () => fail('VALIDATION_FAILED'));
    await makeFolder('bad');
    expect(dialog('[data-test="folder-new-issue"]')?.textContent).toBe('VALIDATION_FAILED happened.');
    expect(dialog<HTMLInputElement>('[data-test="folder-new-name"]')?.value).toBe('bad');
    expect(lastCrumb()).toBe('a');
    expect(dialog<HTMLButtonElement>('[data-test="folder-create"]')?.disabled).toBe(false);
    api.handlers.set('kernel.folder.create', (input) => ({ path: `${(input as { path: string }).path}/${(input as { name: string }).name}` }));
    api.handlers.set('kernel.folder.list', (input) => listingOf((input as { path: string }).path, '/a', []));
    await makeFolder('good');
    expect(lastCrumb()).toBe('good');
    expect(dialog('[data-test="folder-new-row"]')).toBeNull();
  });
});

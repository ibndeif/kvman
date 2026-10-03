import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { deferred, dialog, entries, folderApi, go, holdFolders, lastCrumb, listingOf, openDialog, submitPath } from './support/folder-fake.ts';
import { click, mountApp, settle, type } from './support/mount-app.ts';

const busy = (): string | null | undefined => dialog('[data-test="folder-list"]')?.getAttribute('aria-busy');

describe('navigating the folder browser (06 §6.2, ADR 0009, 223)', () => {
  it('QA14-H3 quick clicks never show an older answer', async () => {
    const api = folderApi();
    const slow = deferred<Json>();
    holdFolders(api, (path) => (path === '/a' ? slow.promise : undefined));
    const app = await mountApp(api, '/');
    await openDialog(app);
    await submitPath('/a');
    await go('/e1');
    expect(lastCrumb()).toBe('e1');
    slow.resolve(listingOf('/a', '/', ['b', 'c']));
    await settle();
    expect(lastCrumb()).toBe('e1');
    expect(entries()).toEqual([]);
  });

  it('QA14-H4 a folder that is opening shows a loading state, and the last folder stays on screen', async () => {
    const api = folderApi();
    const slow = deferred<Json>();
    holdFolders(api, (path) => (path === '/a' ? slow.promise : undefined));
    const app = await mountApp(api, '/');
    await openDialog(app);
    expect(busy()).toBe('false');
    expect(dialog('[data-test="folder-spinner"]')).toBeNull();
    await submitPath('/a');
    await settle();
    expect(busy()).toBe('true');
    expect(dialog('[data-test="folder-spinner"]')).not.toBeNull();
    expect(entries()).toEqual(['docs', 'projects']);
    slow.resolve(listingOf('/a', '/', ['b', 'c']));
    await settle();
    expect(busy()).toBe('false');
    expect(dialog('[data-test="folder-spinner"]')).toBeNull();
    expect(entries()).toEqual(['b', 'c']);
  });

  it('QA14-H5 a folder already seen shows at once on Up, is read again, and the new answer replaces it', async () => {
    const api = folderApi();
    const slow = deferred<Json>();
    holdFolders(api, (path, call) => (path === '/a' && call === 2 ? slow.promise : undefined));
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/a');
    await click(dialog('[data-test="folder-entry-b"]'));
    expect(lastCrumb()).toBe('b');
    await click(dialog('[data-test="folder-up"]'));
    expect(lastCrumb()).toBe('a');
    expect(entries()).toEqual(['b', 'c']);
    expect(dialog('[data-test="folder-spinner"]')).not.toBeNull();
    expect(api.callsTo('kernel.folder.list').filter((call) => (call.input as { path?: string }).path === '/a')).toHaveLength(2);
    slow.resolve(listingOf('/a', '/', ['b', 'c', 'd']));
    await settle();
    expect(entries()).toEqual(['b', 'c', 'd']);
    expect(dialog('[data-test="folder-spinner"]')).toBeNull();
  });

  it('QA14-H6 Back returns to the folder shown before, and is off at the first', async () => {
    const app = await mountApp(folderApi(), '/');
    await openDialog(app);
    const back = (): boolean | undefined => dialog<HTMLButtonElement>('[data-test="folder-back"]')?.disabled;
    expect(back()).toBe(true);
    await go('/a');
    await click(dialog('[data-test="folder-entry-b"]'));
    await click(dialog('[data-test="folder-entry-c"]'));
    expect(lastCrumb()).toBe('c');
    expect(back()).toBe(false);
    await click(dialog('[data-test="folder-back"]'));
    expect(lastCrumb()).toBe('b');
    await click(dialog('[data-test="folder-back"]'));
    expect(lastCrumb()).toBe('a');
    await click(dialog('[data-test="folder-back"]'));
    expect(lastCrumb()).toBe('ahmed');
    expect(back()).toBe(true);
  });

  it('QA14-E8 the cache holds 50 folders: the oldest is read fresh, a recent one shows at once', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    for (let index = 0; index <= 50; index += 1) await go(`/e${String(index)}`);
    const gate = deferred<Json>();
    holdFolders(api, () => gate.promise);
    await submitPath('/e0');
    await settle();
    expect(lastCrumb()).toBe('e50');
    gate.resolve(listingOf('/e0', '/', []));
    await settle();
    expect(lastCrumb()).toBe('e0');
    const second = deferred<Json>();
    holdFolders(api, () => second.promise);
    await submitPath('/e2');
    await settle();
    expect(lastCrumb()).toBe('e2');
    second.resolve(listingOf('/e2', '/', []));
    await settle();
  });

  it('QA14-E8 a folder seen without Show hidden is read again when it is on, not shown from the cache', async () => {
    const fresh = folderApi();
    const app = await mountApp(fresh, '/');
    await openDialog(app);
    await go('/a');
    expect(entries()).toEqual(['b', 'c']);
    const hiddenAnswer = deferred<Json>();
    holdFolders(fresh, () => hiddenAnswer.promise);
    await click(dialog('[data-test="folder-hidden"]'));
    expect(entries()).toEqual(['b', 'c']);
    hiddenAnswer.resolve(listingOf('/a', '/', ['.secret', 'b', 'c']));
    await settle();
    expect(entries()).toEqual(['.secret', 'b', 'c']);
  });

  it('QA14-E13 a path typed while the first listing is still loading is not replaced when it arrives, and Enter goes there', async () => {
    const api = folderApi();
    const first = deferred<Json>();
    holdFolders(api, (path, call) => (path === '' && call === 1 ? first.promise : undefined));
    const app = await mountApp(api, '/');
    await openDialog(app);
    await type(dialog('[data-test="folder-path"]'), '/a');
    first.resolve(listingOf('/home/ahmed', '/home', ['docs', 'projects']));
    await settle();
    expect(dialog<HTMLInputElement>('[data-test="folder-path"]')?.value).toBe('/a');
    await go('/a');
    expect(lastCrumb()).toBe('a');
    await click(dialog('[data-test="folder-entry-b"]'));
    expect(dialog<HTMLInputElement>('[data-test="folder-path"]')?.value).toBe('/a/b');
  });
});

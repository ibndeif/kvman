import { describe, expect, it } from 'vitest';
import { dialog, entries, folderApi, go, lastCrumb, openDialog, press } from './support/folder-fake.ts';
import { click, mountApp, settle, type } from './support/mount-app.ts';

const filter = (): HTMLInputElement | null => dialog<HTMLInputElement>('[data-test="folder-filter"]');
const selected = (): string[] => [...document.querySelectorAll('[role="option"][aria-selected="true"]')].map((row) => row.textContent?.trim().replace(/Open$/, '') ?? '');

describe('the folder browser from the keyboard and with the filter (06 §6.2, ADR 0009, 225)', () => {
  it('QA14-H10 the filter narrows the list by what was typed, ignoring case, and says when nothing matches', async () => {
    const app = await mountApp(folderApi(), '/');
    await openDialog(app);
    await go('/filter');
    expect(entries()).toEqual(['alpha', 'Beta', 'alphabet']);
    await type(filter(), 'ALPH');
    expect(entries()).toEqual(['alpha', 'alphabet']);
    await type(filter(), 'zzz');
    expect(entries()).toEqual([]);
    expect(dialog('[data-test="folder-no-match"]')?.textContent).toBe('No folder matches.');
    await press(filter(), 'Escape');
    expect(filter()?.value).toBe('');
    expect(entries()).toEqual(['alpha', 'Beta', 'alphabet']);
    expect(dialog('[data-test="folder-list"]')).not.toBeNull();
  });

  it('QA14-H11 the filter has focus when the dialog opens, the arrows move a highlight, Enter enters, and Backspace goes up', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    expect(document.activeElement).toBe(filter());
    await go('/a');
    expect(selected()).toEqual([]);
    await press(filter(), 'ArrowDown');
    expect(selected()).toEqual(['b']);
    await press(filter(), 'ArrowDown');
    expect(selected()).toEqual(['c']);
    await press(filter(), 'ArrowUp');
    expect(selected()).toEqual(['b']);
    await press(filter(), 'Enter');
    expect(lastCrumb()).toBe('b');
    expect(api.callsTo('kernel.folder.list').at(-1)?.input).toEqual({ path: '/a/b', hidden: false });
    await press(filter(), 'Backspace');
    expect(lastCrumb()).toBe('a');
    await press(filter(), 'Enter');
    expect(api.callsTo('kernel.workspace.open').map((call) => call.input)).toEqual([{ path: '/a' }]);
    expect(dialog('[data-test="folder-list"]')).toBeNull();
  });

  it('QA14-H11 typing a filter highlights the first match, and Enter goes into it', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/filter');
    await type(filter(), 'bet');
    expect(selected()).toEqual(['Beta']);
    await press(filter(), 'Enter');
    expect(lastCrumb()).toBe('Beta');
  });

  it('QA14-E9 the filter clears when the folder changes, and Escape closes the dialog only when it is empty', async () => {
    const app = await mountApp(folderApi(), '/');
    await openDialog(app);
    await go('/filter');
    await type(filter(), 'alp');
    expect(entries()).toEqual(['alpha', 'alphabet']);
    await click(dialog('[data-test="folder-entry-alpha"]'));
    expect(lastCrumb()).toBe('alpha');
    expect(filter()?.value).toBe('');
    await type(filter(), 'x');
    await press(filter(), 'Escape');
    expect(filter()?.value).toBe('');
    expect(dialog('[data-test="folder-list"]')).not.toBeNull();
    await press(filter(), 'Escape');
    await settle();
    expect(dialog('[data-test="folder-list"]')).toBeNull();
  });
});

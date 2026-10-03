import { describe, expect, it } from 'vitest';
import { dialog, entries, folderApi, go, lastCrumb, openDialog } from './support/folder-fake.ts';
import { click, mountApp } from './support/mount-app.ts';

const crumbs = (): string[] => [...document.querySelectorAll('[data-test^="folder-crumb-"]')].map((crumb) => crumb.textContent?.trim() ?? '');

describe('where you are and where you can go in the folder browser (06 §6.2, ADR 0009, 224)', () => {
  it('QA14-H7 the path is clickable segments, and a click goes to that folder', async () => {
    const api = folderApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/home/me/projects/todo');
    expect(crumbs()).toEqual(['/', 'home', 'me', 'projects', 'todo']);
    expect(dialog('[data-test="folder-crumb-4"]')?.getAttribute('aria-current')).toBe('location');
    await click(dialog('[data-test="folder-crumb-2"]'));
    expect(lastCrumb()).toBe('me');
    expect(api.callsTo('kernel.folder.list').at(-1)?.input).toEqual({ path: '/home/me', hidden: false });
    await go('C:\\Users\\me');
    expect(crumbs()).toEqual(['C:\\', 'Users', 'me']);
  });

  it('QA14-H8 Places lists Home and the open workspaces, goes to one, and marks the one shown', async () => {
    const app = await mountApp(folderApi(), '/');
    await openDialog(app);
    const place = (id: string): HTMLElement | null => dialog(`[data-test="folder-place-${id}"]`);
    expect([...document.querySelectorAll('[data-test^="folder-place-"]')].map((found) => found.textContent?.trim())).toEqual(['Home', 'project']);
    expect(place('home')?.getAttribute('aria-current')).toBe('true');
    expect(place('w1')?.getAttribute('aria-current')).toBeNull();
    await click(place('w1'));
    expect(lastCrumb()).toBe('project');
    expect(entries()).toEqual(['src']);
    expect(place('w1')?.getAttribute('aria-current')).toBe('true');
    expect(place('home')?.getAttribute('aria-current')).toBeNull();
  });

  it('QA14-H9 a folder that is already a workspace carries the Open mark, and the others do not', async () => {
    const app = await mountApp(folderApi(), '/');
    await openDialog(app);
    await go('/work');
    expect(entries()).toEqual(['other', 'project']);
    expect(dialog('[data-test="folder-open-mark-project"]')?.textContent).toBe('Open');
    expect(dialog('[data-test="folder-open-mark-other"]')).toBeNull();
  });
});

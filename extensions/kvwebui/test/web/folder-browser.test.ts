import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, mountApp, type, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// A small folder tree the fake kernel answers `kernel.folder.list` from; the third list is what `hidden` adds.
const tree: Record<string, string[]> = {
  '/': ['home', 'work'],
  '/home/me': ['projects', 'docs'],
  '/home/me/projects': ['todo', 'api'],
  '/home/me/projects/todo': [],
  '/work/project': ['src'],
};
const hiddenOnly: Record<string, string[]> = { '/home/me': ['.config'] };

function listing(path: string, hidden: boolean, truncated = false): Json {
  const names = [...(tree[path] ?? []), ...(hidden ? (hiddenOnly[path] ?? []) : [])];
  const parent = path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/';
  return { path, parent, folders: names.map((name) => ({ name, path: `${path === '/' ? '' : path}/${name}` })), truncated };
}

function browserApi(options: { truncatedAt?: string } = {}): ReturnType<typeof notesApi> {
  const api = notesApi();
  api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' });
  api.handlers.set('kernel.folder.list', (input: Json) => {
    const { path = '/home/me', hidden = false } = input as { path?: string; hidden?: boolean };
    if (tree[path] === undefined) return fail('VALIDATION_FAILED');
    return listing(path, hidden, path === options.truncatedAt);
  });
  api.handlers.set('kernel.workspace.open', (input: Json) => {
    const workspace = { id: 'w9', name: 'opened', path: String((input as { path: string }).path) };
    api.workspaces.push(workspace);
    return workspace;
  });
  return api;
}

async function openDialog(app: Mounted): Promise<void> {
  await click(app.find('button[aria-label^="Workspace:"]'));
  await click(app.find('[data-test="open-folder"]'));
}

const dialog = <Found extends HTMLElement = HTMLElement>(selector: string): Found | null => document.querySelector<Found>(selector);
const entries = (): string[] => [...document.querySelectorAll('[data-test^="folder-entry-"]')].map((entry) => entry.textContent?.trim() ?? '');
const shownPath = (): string => dialog<HTMLInputElement>('[data-test="folder-path"]')?.value ?? '';

async function go(path: string): Promise<void> {
  await type(dialog('[data-test="folder-path"]'), path);
  dialog('[data-test="folder-path"]')?.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await mountedSettle();
}

const mountedSettle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('the folder browser (06 §6.2, ADR 0009, 220)', () => {
  it('QA13-H4 shows the folders of the start folder, goes into one and up, and opens the folder shown as a workspace', async () => {
    const api = browserApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    expect(shownPath()).toBe('/home/me');
    expect(entries()).toEqual(['projects', 'docs']);
    await click(dialog('[data-test="folder-entry-projects"]'));
    expect(shownPath()).toBe('/home/me/projects');
    expect(entries()).toEqual(['todo', 'api']);
    await click(dialog('[data-test="folder-up"]'));
    expect(shownPath()).toBe('/home/me');
    await click(dialog('[data-test="folder-entry-projects"]'));
    await click(dialog('[data-test="folder-open"]'));
    expect(api.callsTo('kernel.workspace.open').map((call) => call.input)).toEqual([{ path: '/home/me/projects' }]);
    expect(app.state.workspace.value).toBe('w9');
    expect(dialog('[data-test="folder-open"]')).toBeNull();
  });

  it('QA13-H5 a typed path goes there when Enter is pressed', async () => {
    const app = await mountApp(browserApi(), '/');
    await openDialog(app);
    await go('/home/me/projects/todo');
    expect(shownPath()).toBe('/home/me/projects/todo');
    expect(entries()).toEqual([]);
  });

  it('QA13-H6 Show hidden lists the current folder again with hidden folders', async () => {
    const api = browserApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    expect(entries()).toEqual(['projects', 'docs']);
    await click(dialog('[data-test="folder-hidden"]'));
    expect(api.callsTo('kernel.folder.list').at(-1)?.input).toEqual({ path: '/home/me', hidden: true });
    expect(entries()).toEqual(['projects', 'docs', '.config']);
  });

  it('QA13-E5 a folder that cannot be read says why, keeps the folder shown, and that folder still opens', async () => {
    const api = browserApi();
    const app = await mountApp(api, '/');
    await openDialog(app);
    await go('/nowhere');
    expect(dialog('[data-test="folder-issue"]')?.textContent).toContain('VALIDATION_FAILED');
    expect(entries()).toEqual(['projects', 'docs']);
    await click(dialog('[data-test="folder-open"]'));
    expect(api.callsTo('kernel.workspace.open').map((call) => call.input)).toEqual([{ path: '/home/me' }]);
  });

  it('QA13-E6 Up is off at the root, and a folder with no sub-folders says it is empty', async () => {
    const app = await mountApp(browserApi(), '/');
    await openDialog(app);
    await go('/');
    expect(dialog<HTMLButtonElement>('[data-test="folder-up"]')?.disabled).toBe(true);
    expect(entries()).toEqual(['home', 'work']);
    await go('/home/me/projects/todo');
    expect(dialog<HTMLButtonElement>('[data-test="folder-up"]')?.disabled).toBe(false);
    expect(dialog('[data-test="folder-empty"]')?.textContent).toBe('No folders here.');
  });

  it("QA13-E7 the first list is the open workspace's folder, and from Home it is Home's folder", async () => {
    const inProject = browserApi();
    const app = await mountApp(inProject, '/?workspace=w1');
    await openDialog(app);
    expect(inProject.callsTo('kernel.folder.list').map((call) => call.input)).toEqual([{ path: '/work/project', hidden: false }]);
    expect(entries()).toEqual(['src']);

    const atHome = browserApi();
    const home = await mountApp(atHome, '/?workspace=home');
    await openDialog(home);
    expect(atHome.callsTo('kernel.folder.list').map((call) => call.input)).toEqual([{ hidden: false }]);
  });

  it('QA13-E8 a list that was cut says so', async () => {
    const app = await mountApp(browserApi({ truncatedAt: '/home/me' }), '/');
    await openDialog(app);
    expect(dialog('[data-test="folder-truncated"]')?.textContent).toContain('first 1,000');
    await click(dialog('[data-test="folder-entry-projects"]'));
    expect(dialog('[data-test="folder-truncated"]')).toBeNull();
  });
});

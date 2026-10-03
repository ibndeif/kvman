import type { Json } from '@kvman/sdk';
import { expect } from 'vitest';
import { fail, type FakeApi, type Handler } from './fake-api.ts';
import { click, settle, type, type Mounted } from './mount-app.ts';
import { notesApi } from './notes.ts';

// The folders the fake kernel lists: Home's folder, a small tree for the navigation tests, the filter folders, the
// workspaces' folders, one Windows folder, and numbered folders for the cache-limit test.
function treeOf(): Record<string, string[]> {
  const tree: Record<string, string[]> = {
    '/': ['a', 'home', 'work'],
    '/home/ahmed': ['docs', 'projects'],
    '/home/me': ['projects', 'docs'],
    '/home/me/projects': ['todo', 'api'],
    '/home/me/projects/todo': [],
    '/work': ['other', 'project'],
    '/work/project': ['src'],
    '/work/second': [],
    '/a': ['b', 'c'],
    '/a/b': ['c'],
    '/a/b/c': [],
    '/a/c': [],
    '/filter': ['alpha', 'Beta', 'alphabet'],
    '/filter/alpha': [],
    '/filter/Beta': [],
    '/filter/alphabet': [],
    'C:\\Users\\me': [],
  };
  for (let index = 0; index <= 51; index += 1) tree[`/e${String(index)}`] = [];
  return tree;
}

const hiddenOnly: Record<string, string[]> = { '/a': ['.secret'] };

function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}

function parentOf(path: string): string | null {
  if (path === '/') return null;
  if (/^[A-Za-z]:[\\/]/.test(path)) {
    const root = path.slice(0, 3);
    if (path.length === 3) return null;
    const rest = path.slice(3);
    const cut = Math.max(rest.lastIndexOf('/'), rest.lastIndexOf('\\'));
    return cut === -1 ? root : root + rest.slice(0, cut);
  }
  const share = /^\\\\[^\\]+\\[^\\]+/.exec(path)?.[0];
  if (share !== undefined) {
    if (path.length === share.length) return null;
    const rest = path.slice(share.length);
    const cut = rest.lastIndexOf('\\');
    return cut <= 0 ? share : share + rest.slice(0, cut);
  }
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

function childPath(path: string, name: string): string {
  const separator = path.includes('\\') ? '\\' : '/';
  return path.endsWith(separator) ? `${path}${name}` : `${path}${separator}${name}`;
}

/** The fake API behind the folder browser tests: Home, the `w1` workspace, the tree above, and folder handlers. */
export function folderApi(): FakeApi {
  const api = notesApi();
  api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' });
  const tree = treeOf();
  const listing = (path: string, hidden: boolean): Json => {
    const names = [...(tree[path] ?? []), ...(hidden ? (hiddenOnly[path] ?? []) : [])];
    return { path, parent: parentOf(path), folders: names.map((name) => ({ name, path: childPath(path, name) })), truncated: false };
  };
  const listed: Handler = (input) => {
    const { path = '/home/ahmed', hidden = false } = input as { path?: string; hidden?: boolean };
    if (typeof path !== 'string' || !isAbsolute(path) || tree[path] === undefined) return fail('VALIDATION_FAILED');
    return listing(path, hidden === true);
  };
  api.handlers.set('kernel.folder.list', listed);
  api.handlers.set('kernel.folder.create', (input) => {
    const { path, name } = input as { path: string; name: string };
    const siblings = typeof path === 'string' ? tree[path] : undefined;
    if (siblings === undefined || typeof name !== 'string') return fail('VALIDATION_FAILED');
    const child = childPath(path, name);
    siblings.push(name);
    tree[child] = [];
    return { path: child };
  });
  let opened = 0;
  api.handlers.set('kernel.workspace.open', (input) => {
    opened += 1;
    const path = String((input as { path: string }).path);
    const name = path.split(/[\\/]/).filter((part) => part !== '').at(-1) ?? path;
    const workspace = { id: `w-new-${String(opened)}`, name, path };
    api.workspaces.push(workspace);
    return workspace;
  });
  return api;
}

/** A promise the test resolves later, for answers that arrive slowly. */
export function deferred<Value>(): { promise: Promise<Value>; resolve: (value: Value) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}

/** Opens the "Open a folder…" dialog from the workspace picker. */
export async function openDialog(app: Mounted): Promise<void> {
  await click(app.find('button[aria-label^="Workspace:"]'));
  await click(app.find('[data-test="open-folder"]'));
}

/** Queries the dialog, which renders under `document.body`. */
export function dialog<Found extends HTMLElement = HTMLElement>(selector: string): Found | null {
  return document.querySelector<Found>(selector);
}

/** The names of the folders listed, in order, from their `folder-entry-<name>` buttons. */
export function entries(): string[] {
  return [...document.querySelectorAll('[data-test^="folder-entry-"]')].map((entry) => entry.getAttribute('data-test')?.replace(/^folder-entry-/, '') ?? '');
}

/** The text of the last breadcrumb: the folder actually shown. */
export function lastCrumb(): string {
  const crumbs = [...document.querySelectorAll('[data-test^="folder-crumb-"]')];
  return crumbs.at(-1)?.textContent?.trim() ?? '';
}

/** Sends a key to the filter input, as the dialog's keyboard handling reads it. */
export async function press(filter: HTMLElement | null, key: string): Promise<void> {
  expect(filter).not.toBeNull();
  filter?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await settle();
}

/** Types a path into the dialog's path field and submits it, without waiting for the answer. */
export async function submitPath(path: string): Promise<void> {
  await type(dialog('[data-test="folder-path"]'), path);
  dialog('[data-test="folder-path"]')?.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
}

/** Goes to a typed path and waits for the dialog to settle. */
export async function go(path: string): Promise<void> {
  await submitPath(path);
  await settle();
}

/** What `kernel.folder.list` answers for a folder, written out for answers a test holds back. */
export function listingOf(path: string, parent: string | null, names: readonly string[]): Json {
  return { path, parent, folders: names.map((name) => ({ name, path: `${path === '/' ? '' : path}/${name}` })), truncated: false };
}

/** Answers `kernel.folder.list` for the folders `held` names from a promise the test resolves; others as before. */
export function holdFolders(api: FakeApi, held: (path: string, call: number) => Promise<Json> | undefined): void {
  const original = api.handlers.get('kernel.folder.list');
  const calls = new Map<string, number>();
  api.handlers.set('kernel.folder.list', (input, workspaceId, job) => {
    const path = (input as { path?: string }).path ?? '';
    const call = (calls.get(path) ?? 0) + 1;
    calls.set(path, call);
    return held(path, call) ?? original?.(input, workspaceId, job) ?? null;
  });
}

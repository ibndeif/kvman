import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type { HomeRow, HomeView, Shell } from '../src/shell.ts';

// A fake of the shell's functions for the page tests, and the package's own files.

// happy-dom replaces the global `URL`, so the folders come from the module's own path. Both end in a separator.
export const packageRoot = path.join(import.meta.dirname, '..', path.sep);
export const repositoryRoot = path.join(import.meta.dirname, '..', '..', '..', path.sep);

export function readCatalog(language: 'en' | 'ar'): Record<string, string> {
  const catalog: unknown = JSON.parse(readFileSync(`${packageRoot}locales/${language}.json`, 'utf8'));
  if (typeof catalog !== 'object' || catalog === null) throw new TypeError(`locales/${language}.json is not an object.`);
  return Object.fromEntries(Object.entries(catalog).map(([key, text]) => [key, String(text)]));
}

export const homeRow: HomeRow = { id: 'home', name: 'ahmed', folder: '~', home: true };
export const notesRow: HomeRow = { id: '0199-a b', name: 'notes', folder: '~/work/notes', home: false };
export const dataRow: HomeRow = { id: '0199-c', name: 'data', folder: '/srv/data', home: false };

export function viewOf(change: Partial<HomeView> = {}): HomeView {
  const language = change.language ?? 'en';
  return { language, theme: 'system', texts: readCatalog(language), rows: [homeRow, notesRow, dataRow], failure: null, ...change };
}

export type FakeShell = Shell & { [Call in keyof Shell]: ReturnType<typeof vi.fn<Shell[Call]>> };

export function fakeShell(first: HomeView, after: HomeView = first): FakeShell {
  return {
    load: vi.fn<Shell['load']>(() => Promise.resolve(first)),
    continueInto: vi.fn<Shell['continueInto']>(() => Promise.resolve()),
    remove: vi.fn<Shell['remove']>(() => Promise.resolve(after)),
    openFolder: vi.fn<Shell['openFolder']>(() => Promise.resolve(after)),
  };
}

export function mount(): HTMLElement {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<main id="home"></main>';
  const root = document.getElementById('home');
  if (root === null) throw new Error('The page has no #home.');
  return root;
}

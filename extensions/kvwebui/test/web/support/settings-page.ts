import { expect } from 'vitest';
import { setting, type FakeApi } from './fake-api.ts';
import { mountApp, settle, type Mounted } from './mount-app.ts';
import { notesApi } from './notes.ts';

// The Settings page over the `notes` fixture with one more key, `notes.pageSize`, and what a person does in a field.

export type SettingsPage = { api: FakeApi; app: Mounted; row(key: string): HTMLElement | null; part(key: string, name: string): HTMLElement | null; control<Found extends HTMLElement = HTMLInputElement>(key: string): Found | null; sets(): unknown[]; resets(): unknown[] };

export async function openSettings(prepare: (api: FakeApi) => void = () => undefined): Promise<SettingsPage> {
  const api = notesApi();
  api.settings.push(setting('notes.pageSize', { type: 'integer', minimum: 0 }, ['global', 'workspace'], { default: 20 }));
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.title': 'Notes', 'notes.pageSize.title': 'Page size' };
  prepare(api);
  const app = await mountApp(api, '/kvwebui/settings');
  const row = (key: string) => app.find(`[data-test="setting-${key}"]`);
  return {
    api,
    app,
    row,
    part: (key, name) => row(key)?.querySelector<HTMLElement>(`[data-test="${name}"]`) ?? null,
    control: <Found extends HTMLElement = HTMLInputElement>(key: string) => row(key)?.querySelector<Found>('[data-test="setting-control"] :is(input, select, textarea)') ?? null,
    sets: () => api.callsTo('kernel.settings.set').map((call) => call.input),
    resets: () => api.callsTo('kernel.settings.reset').map((call) => call.input),
  };
}

/** Leaves a field: the browser's `change` after typing. */
export async function leave(element: HTMLElement | null): Promise<void> {
  expect(element).toBeInstanceOf(HTMLElement);
  element?.dispatchEvent(new Event('change'));
  await settle();
}

export async function pressEnter(element: HTMLElement | null): Promise<void> {
  expect(element).toBeInstanceOf(HTMLElement);
  element?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  await settle();
}

import type { Json } from '@kvman/sdk';
import { expect } from 'vitest';
import { setting, type FakeApi } from './fake-api.ts';
import { extension, mountApp, settle, type Mounted } from './mount-app.ts';
import { notesApi, notesUi } from './notes.ts';

// Setting rows where they now live (ADR 0014): kvman's own on the Settings page, and an extension's on its own page.
// The `notes` fixture gets one more key, `notes.pageSize`, and a configuration holding every `notes.*` key; `kvwebui`
// is loaded too, with its built-in configuration. And what a person does in a field.

export type SettingsPage = { api: FakeApi; app: Mounted; row(key: string): HTMLElement | null; part(key: string, name: string): HTMLElement | null; control<Found extends HTMLElement = HTMLInputElement>(key: string): Found | null; sets(): unknown[]; resets(): unknown[] };

const paths = { settings: '/kvwebui/settings', notes: '/kvwebui/extension/notes', kvwebui: '/kvwebui/extension/kvwebui' };

const ownKeys = (api: FakeApi, namespace: string) => api.settings.filter((spec) => spec.key.startsWith(`${namespace}.`));

/** A configuration with a heading and every setting of `notes`. */
export function notesConfiguration(api: FakeApi): Json {
  return { type: 'card', title: 'notes.config.title', children: ownKeys(api, 'notes').map((spec) => ({ type: 'setting', key: spec.key })) };
}

/** The fake API with `notes` (and its settings) and `kvwebui` loaded. */
export function configuredApi(prepare: (api: FakeApi) => void = () => undefined): FakeApi {
  const api = notesApi();
  api.settings.push(setting('notes.pageSize', { type: 'integer', minimum: 0 }, ['global', 'workspace'], { default: 20 }));
  api.catalogs['en'] = { ...api.catalogs['en'], 'notes.title': 'Notes', 'notes.pageSize.title': 'Page size', 'notes.config.title': 'Lists' };
  api.extensions.push({ ...extension('kvwebui'), name: '@kvman/kvwebui', queries: [] });
  prepare(api);
  for (const loaded of api.extensions) loaded.settings = ownKeys(api, loaded.namespace).map((spec) => ({ key: spec.key, description: spec.description, scopes: spec.scopes }));
  api.handlers.set('notes.ui.get', () => notesUi({ configuration: notesConfiguration(api) }));
  return api;
}

export async function openSettings(prepare: (api: FakeApi) => void = () => undefined, page: keyof typeof paths = 'notes'): Promise<SettingsPage> {
  const api = configuredApi(prepare);
  const app = await mountApp(api, paths[page]);
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

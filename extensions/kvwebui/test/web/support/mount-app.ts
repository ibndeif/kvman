import { flushPromises } from '@vue/test-utils';
import { afterEach, expect, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { createKvwebui, type KvwebuiApp } from '../../../web/src/create-app.ts';
import type { ExtensionInfo, FakeApi } from './fake-api.ts';
import { createFakeComponents, type FakeComponents } from './fake-components.ts';

// Mounts the whole app against a fake API and fake components, the way the browser opens it, and cleans up after each
// test: the app, the tab's storage, and the page's language, direction, and theme.

export type Mounted = KvwebuiApp & { components: FakeComponents; reloads: () => number; root: HTMLElement; text(): string; find<Found extends HTMLElement = HTMLElement>(selector: string): Found | null; findAll(selector: string): HTMLElement[]; settle(): Promise<void> };

const mounted: Mounted[] = [];

afterEach(() => {
  for (const app of mounted.splice(0)) app.app.unmount();
  document.body.replaceChildren();
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
  vi.useRealTimers();
});

export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) await flushPromises();
}

export async function mountApp(api: FakeApi, path = '/', components = createFakeComponents()): Promise<Mounted> {
  let reloads = 0;
  const kvwebui = createKvwebui({ history: createMemoryHistory(), fetch: api.fetch, components, reload: () => (reloads += 1) });
  await kvwebui.router.push(path);
  const root = document.createElement('div');
  document.body.append(root);
  kvwebui.app.mount(root);
  await vi.waitFor(() => expect(kvwebui.state.booted.value || kvwebui.state.bootProblem.value !== undefined).toBe(true));
  await settle();
  const app: Mounted = {
    ...kvwebui,
    components,
    reloads: () => reloads,
    root,
    text: () => root.textContent ?? '',
    find: <Found extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<Found>(selector),
    findAll: (selector) => [...root.querySelectorAll<HTMLElement>(selector)],
    settle,
  };
  mounted.push(app);
  return app;
}

type CallSpec = { name: string; public?: boolean; input?: Record<string, unknown>; description?: string };

const emptyObject = { type: 'object', properties: {} };

// A `kernel.extensions.list` row for a fixture extension.
export function extension(namespace: string, calls: { queries?: CallSpec[]; commands?: CallSpec[] } = {}, source: ExtensionInfo['source'] = 'bundled'): ExtensionInfo {
  const info = (call: CallSpec) => ({ name: call.name, description: call.description ?? `The English description of ${call.name}.`, public: call.public ?? true, input: (call.input ?? emptyObject) as Record<string, never>, output: {} });
  return {
    name: `@test/${namespace}`,
    version: '0.1.0',
    source,
    revision: 0,
    namespace,
    commands: (calls.commands ?? []).map(info),
    queries: [{ name: `${namespace}.ui.get` }, ...(calls.queries ?? [])].map(info),
    settings: [],
    handlers: [],
  };
}

export async function click(element: HTMLElement | null): Promise<void> {
  expect(element).not.toBeNull();
  element?.click();
  await settle();
}

export async function type(element: HTMLElement | null, value: string): Promise<void> {
  expect(element).toBeInstanceOf(HTMLElement);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'));
  }
  await settle();
}

// The button whose text is `text`.
export function button(app: Mounted, text: string): HTMLElement | null {
  return app.findAll('button').find((candidate) => candidate.textContent.trim() === text) ?? null;
}

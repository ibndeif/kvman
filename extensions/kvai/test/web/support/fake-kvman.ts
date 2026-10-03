import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';
import { vi } from 'vitest';
import type { Json } from '@kvman/sdk';
import type { Kvman, StreamEvent, View } from '@kvman/sdk/web';
import { defineComponent, h, type PropType } from 'vue';
import ar from '../../../locales/ar.json' with { type: 'json' };
import en from '../../../locales/en.json' with { type: 'json' };

// A fake of kvwebui's injected `kvman` for kvai's component tests: calls are answered by handlers and recorded, a
// job's stream is driven by the test, and texts are translated with kvai's real catalogs.

type Handler = (input: Record<string, unknown>) => unknown;

export type FakeKvman = {
  kvman: Kvman;
  calls: { name: string; input: Record<string, unknown> }[];
  handle(name: string, handler: Handler): void;
  emit(jobId: string, event: StreamEvent): void;
  end(jobId: string): void;
  refresh: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
  language: { value: string };
};

const catalogs: Record<'en' | 'ar', Record<string, string>> = { en, ar };

export const ViewStub = defineComponent({
  props: { view: { type: Object as PropType<View>, required: true } },
  setup: () => () => h('div', { 'data-test': 'view' }),
});

type Channel = { events: StreamEvent[]; ended: boolean; wake: (() => void) | undefined };

export function createFakeKvman(): FakeKvman {
  const handlers = new Map<string, Handler>();
  const calls: FakeKvman['calls'] = [];
  const channels = new Map<string, Channel>();
  const language = { value: 'en' };
  const channel = (jobId: string): Channel => {
    const found = channels.get(jobId) ?? { events: [], ended: false, wake: undefined };
    channels.set(jobId, found);
    return found;
  };
  const refresh = vi.fn();
  const navigate = vi.fn();
  const toast = vi.fn();
  const exec = async (name: string, input: unknown): Promise<unknown> => {
    const fields = typeof input === 'object' && input !== null ? Object.fromEntries(Object.entries(input)) : {};
    calls.push({ name, input: fields });
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`No fake answer for ${name}.`);
    return handler(fields);
  };
  async function* stream(jobId: string): AsyncIterable<StreamEvent> {
    const found = channel(jobId);
    for (let index = 0; ; index += 1) {
      while (index >= found.events.length && !found.ended) await new Promise<void>((resolve) => (found.wake = resolve));
      const event = found.events[index];
      if (event === undefined) return;
      yield event;
    }
  }
  const translate = (key: string, params?: Record<string, unknown>): string => {
    const text = (language.value === 'ar' ? catalogs.ar : catalogs.en)[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`));
  };
  const kvman = {
    exec,
    execAsync: async (name: string, input: unknown) => String(await exec(name, input)),
    stream,
    follow: async () => undefined,
    refresh,
    navigate,
    toast,
    panel: () => undefined,
    t: translate,
    workspace: { value: { id: 'home', name: 'notes-app', path: '/work/notes-app' } },
    View: ViewStub,
  } as unknown as Kvman;
  return {
    kvman,
    calls,
    handle: (name, handler) => void handlers.set(name, handler),
    emit: (jobId, event) => {
      const found = channel(jobId);
      found.events.push(event);
      found.wake?.();
    },
    end: (jobId) => {
      const found = channel(jobId);
      found.ended = true;
      found.wake?.();
    },
    refresh,
    navigate,
    toast,
    language,
  };
}

/** A progress event from kvai. */
export const progress = (source: '@kvman/kvai', data: Json): StreamEvent => ({ type: 'progress', source, data });

/** A result event with the job's output. */
export const result = (output: Json): StreamEvent => ({ type: 'result', output });

/** A problem event with a catalog code. */
export const problem = (code: string, params: Record<string, Json> = {}, message = 'Failed.'): StreamEvent => ({
  type: 'problem',
  problem: { code, message, params },
});

export async function mounted(component: Component, fake: FakeKvman, props: Record<string, unknown> = {}): Promise<VueWrapper> {
  // Attached to the document, so focus (the picker's search box) reaches `document.activeElement` as in kvwebui.
  const wrapper = mount(component, { props, global: { provide: { kvman: fake.kvman } }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

export function problemError(code: string, params: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(code), { problem: { code, message: code, params } });
}

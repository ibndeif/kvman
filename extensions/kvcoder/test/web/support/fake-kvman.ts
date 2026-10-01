import { defineComponent, h, type PropType } from 'vue';
import { vi } from 'vitest';
import type { Json } from '@kvman/sdk';
import type { Kvman, StreamEvent, View } from '@kvman/sdk/web';
import ar from '../../../locales/ar.json' with { type: 'json' };
import en from '../../../locales/en.json' with { type: 'json' };

// A fake of kvwebui's injected `kvman` for component tests: calls are answered by handlers and recorded, a job's stream
// is driven by the test, texts are translated with kvcoder's real catalogs, and `View` renders a Markdown view's text.

type Handler = (input: Record<string, unknown>) => unknown;

export type FakeKvman = {
  kvman: Kvman;
  calls: { name: string; input: Record<string, unknown> }[];
  handle(name: string, handler: Handler): void;
  emit(jobId: string, event: StreamEvent): void;
  end(jobId: string): void;
  navigate: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
  language: { value: string };
};

const catalogs: Record<'en' | 'ar', Record<string, string>> = { en, ar };

export const MarkdownStub = defineComponent({
  props: { view: { type: Object as PropType<View>, required: true } },
  setup: (props) => () => h('div', { 'data-test': 'markdown' }, props.view.type === 'markdown' ? String(props.view.params?.['text'] ?? '') : ''),
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
    navigate,
    toast,
    panel: () => undefined,
    t: translate,
    workspace: { value: { id: 'home', name: 'notes-app', path: '/work/notes-app' } },
    View: MarkdownStub,
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
    navigate,
    toast,
    language,
  };
}

/** A progress event from kvai or kvcoder. */
export const progress = (source: '@kvman/kvai' | '@kvman/kvcoder', data: Json): StreamEvent => ({ type: 'progress', source, data });

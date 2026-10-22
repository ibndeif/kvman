import { defineComponent, h, ref, type PropType, type Ref } from 'vue';
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
  refresh: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  toast: ReturnType<typeof vi.fn>;
  open: ReturnType<typeof vi.fn<(url: string) => 'opened' | 'blocked'>>;
  // The host of an embedded page (ADR 0100, 14): whether there is one, what was asked of it, and its inserting.
  host: { embedded: boolean; openFile: ReturnType<typeof vi.fn>; openDiff: ReturnType<typeof vi.fn>; openChange: ReturnType<typeof vi.fn>; insert(text: string): void; handlers(): number; pressNew(): void; newOffers(): number };
  language: { value: string };
  scope: Ref<'global' | 'workspace'>;
  workspace: Ref<{ id: string; name: string; path: string }>;
};

const catalogs: Record<'en' | 'ar', Record<string, string>> = { en, ar };

export const MarkdownStub = defineComponent({
  props: { view: { type: Object as PropType<View>, required: true } },
  setup: (props) => () => h('div', { 'data-test': 'markdown' }, props.view.type === 'markdown' ? String(props.view.params?.['text'] ?? '') : ''),
});

type Channel = { events: StreamEvent[]; ended: boolean; wake: (() => void) | undefined };

// kvwebui's choice of a plural form (ADR 0098, 1); a text with the wrong number of forms fails the test.
const categoryOrder: readonly Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
function pluralForm(key: string, text: string, language: string, count: unknown): string {
  const forms = text.split('|').map((form) => form.trim());
  if (forms.length === 1) return text;
  const rules = new Intl.PluralRules(language);
  const categories = categoryOrder.filter((category) => rules.resolvedOptions().pluralCategories.includes(category));
  if (forms.length !== categories.length) throw new Error(`${key} has ${forms.length} plural forms; ${language} has ${categories.length}.`);
  return (typeof count === 'number' ? forms[categories.indexOf(rules.select(count))] : forms.at(-1)) ?? text;
}

export function createFakeKvman(): FakeKvman {
  // No extension registered a slash command, unless a test says so.
  const handlers = new Map<string, Handler>([['kvcoder.slash.list', () => []]]);
  const calls: FakeKvman['calls'] = [];
  const channels = new Map<string, Channel>();
  const language = { value: 'en' };
  const channel = (jobId: string): Channel => {
    const found = channels.get(jobId) ?? { events: [], ended: false, wake: undefined };
    channels.set(jobId, found);
    return found;
  };
  const scope = ref<'global' | 'workspace'>('global');
  const workspace = ref({ id: 'home', name: 'notes-app', path: '/work/notes-app' });
  const refresh = vi.fn();
  const navigate = vi.fn();
  const toast = vi.fn();
  const open = vi.fn<(url: string) => 'opened' | 'blocked'>(() => 'opened');
  const inserts = new Set<(text: string) => void>();
  const newOffers: (() => void)[] = [];
  const host: FakeKvman['host'] = {
    embedded: false,
    openFile: vi.fn(),
    openDiff: vi.fn(),
    openChange: vi.fn(),
    insert: (text) => inserts.forEach((handler) => handler(text)),
    handlers: () => inserts.size,
    pressNew: () => newOffers.at(-1)?.(),
    newOffers: () => newOffers.length,
  };
  const hostCalls = {
    get embedded() {
      return host.embedded;
    },
    openFile: host.openFile,
    openDiff: host.openDiff,
    openChange: host.openChange,
    onInsert: (handler: (text: string) => void) => {
      inserts.add(handler);
      return () => void inserts.delete(handler);
    },
    offerNew: (handler: () => void) => {
      newOffers.push(handler);
      return () => {
        const index = newOffers.indexOf(handler);
        if (index >= 0) newOffers.splice(index, 1);
      };
    },
  };
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
    const text = pluralForm(key, (language.value === 'ar' ? catalogs.ar : catalogs.en)[key] ?? key, language.value, params?.['count']);
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
    open,
    host: hostCalls,
    t: translate,
    workspace,
    scope,
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
    refresh,
    navigate,
    toast,
    open,
    host,
    language,
    scope,
    workspace,
  };
}

/** A progress event from kvai or kvcoder. */
export const progress = (source: '@kvman/kvai' | '@kvman/kvcoder', data: Json): StreamEvent => ({ type: 'progress', source, data });

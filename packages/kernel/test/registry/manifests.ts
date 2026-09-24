import { manifestSchema, type Manifest } from '@kvman/protocol';

const objectSchema = { type: 'object', properties: {}, additionalProperties: false };

export const workspaceA = 'a'.repeat(64);
export const workspaceB = 'b'.repeat(64);

export function command(type: string, scope?: 'global'): Manifest['types'][number] {
  return { type, kind: 'command', description: 'A command.', input: objectSchema, access: 'all', handler: `command:${type}`, ...(scope === undefined ? {} : { scope }) };
}

export function query(type: string): Manifest['types'][number] {
  return { type, kind: 'query', description: 'A query.', input: objectSchema, output: objectSchema, access: 'all', handler: `query:${type}` };
}

export function event(type: string, delivery: 'durable' | 'live' = 'durable'): Manifest['types'][number] {
  return delivery === 'live'
    ? { type, kind: 'event', description: 'An event.', delivery, chunk: 'text' }
    : { type, kind: 'event', description: 'An event.', delivery, payload: objectSchema };
}

export function subscription(eventPattern: string): Manifest['subscriptions'][number] {
  return { event: eventPattern, description: 'A subscription.', handler: `subscription:${eventPattern}` };
}

type Parts = { types?: Manifest['types']; subscriptions?: Manifest['subscriptions'] };

export function manifest(name: string, namespace: string, parts: Parts): Manifest {
  return manifestSchema.parse({
    manifestVersion: 1,
    meta: { name, version: '1.0.0', namespace, title: name, description: `The ${name} extension.`, implements: [] },
    permissions: { capabilities: [], isolation: null, requireTypes: [], requireComponents: [] },
    types: parts.types ?? [],
    subscriptions: parts.subscriptions ?? [],
    schedules: [],
    data: { version: 1, compatibleWith: [], migrations: [], collections: [], logs: [] },
    entities: [],
    config: null,
    errors: [],
    ui: {
      pages: [], navGroups: [], navItems: [], toolbarItems: [], statusItems: [], panels: [], slots: [], actions: [],
      rendererTargets: [], renderers: [], components: [], settingsSection: null,
    },
    translations: null,
    llm: { providers: [], models: [] },
  });
}

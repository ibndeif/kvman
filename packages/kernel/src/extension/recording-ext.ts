import type { Text } from '@kvman/protocol';
import type { Ext, SubscriptionDef } from '@kvman/sdk';
import { compact, type Recording } from './recording.ts';

export type RecordingExt = { ext: Ext; close(): void };

// A typed reference is the registered name itself with a type-only brand (ADR 0044).
function reference<Ref extends string>(name: string): Ref {
  return name as Ref;
}

export function createRecordingExt(recording: Recording, closedError: () => Error): RecordingExt {
  let closed = false;
  const open = (): void => {
    if (closed) throw closedError();
  };

  const ext: Ext = {
    requestCapability(name: string, options: { reason: Text; types?: string[] }) {
      open();
      recording.capabilityNames.push(name);
      recording.capabilities.push(compact({ name, types: options.types, reason: options.reason }));
    },
    requestIsolation(mode, { reason }) {
      open();
      if (recording.firstCall('requestIsolation', 'permissions.isolation')) recording.isolation = { mode, reason: reason };
    },
    requireTypes(types, { reason }) {
      open();
      recording.requireTypes.push({ types, reason: reason });
    },
    requireComponents(components, { reason }) {
      open();
      recording.requireComponents.push({ components, reason: reason });
    },

    registerCommand(name, definition) {
      open();
      const path = `types.${recording.types.length}`;
      recording.typeNames.push({ name, kind: 'command' });
      recording.types.push(compact({
        type: name, kind: 'command', description: definition.description,
        input: recording.jsonSchema(`${path}.input`, definition.input),
        output: definition.output === undefined ? undefined : recording.jsonSchema(`${path}.output`, definition.output),
        examples: definition.examples, lane: definition.lane, concurrency: definition.concurrency, timeoutMs: definition.timeoutMs,
        maxAttempts: definition.maxAttempts, priority: definition.priority, retention: definition.retention, scope: definition.scope,
        access: definition.access ?? 'all', slash: definition.slash, agentTool: definition.agentTool,
        namingException: definition.namingException, handler: `command:${name}`,
      }));
      recording.bind(`command:${name}`, `${path}.handler`, definition.handle);
      return reference(name);
    },
    registerQuery(name, definition) {
      open();
      const path = `types.${recording.types.length}`;
      recording.typeNames.push({ name, kind: 'query' });
      recording.types.push(compact({
        type: name, kind: 'query', description: definition.description,
        input: recording.jsonSchema(`${path}.input`, definition.input),
        output: recording.jsonSchema(`${path}.output`, definition.output),
        examples: definition.examples, timeoutMs: definition.timeoutMs, access: definition.access ?? 'all',
        agentTool: definition.agentTool, namingException: definition.namingException, handler: `query:${name}`,
      }));
      recording.bind(`query:${name}`, `${path}.handler`, definition.handle);
      return reference(name);
    },
    registerEvent(name, definition) {
      open();
      const path = `types.${recording.types.length}`;
      recording.typeNames.push({ name, kind: 'event' });
      recording.types.push(compact({
        type: name, kind: 'event', description: definition.description, delivery: definition.delivery ?? 'durable',
        payload: definition.payload === undefined ? undefined : recording.jsonSchema(`${path}.payload`, definition.payload),
        chunk: definition.chunk, namingException: definition.namingException,
      }));
      return reference(name);
    },
    subscribe(event: string, definition: SubscriptionDef) {
      open();
      const path = `subscriptions.${recording.subscriptions.length}`;
      recording.subscriptionEvents.push(event);
      recording.subscriptions.push(compact({
        event, description: definition.description, lane: definition.lane, concurrency: definition.concurrency,
        timeoutMs: definition.timeoutMs, handler: `subscription:${event}`,
      }));
      recording.bind(`subscription:${event}`, `${path}.handler`, definition.handle);
    },
    registerSchedule(name, definition) {
      open();
      recording.scheduleNames.push(name);
      recording.schedules.push(compact({
        name, description: definition.description, every: definition.every, cron: definition.cron,
        command: definition.command, payload: definition.payload,
      }));
      return reference(name);
    },
    registerError(code, definition) {
      open();
      recording.errorCodes.push(code);
      recording.errors.push(compact({
        code, description: definition.description, title: definition.title, retryable: definition.retryable ?? false, hint: definition.hint,
      }));
      return reference(code);
    },

    registerDataVersion(version, definition = {}) {
      open();
      if (!recording.firstCall('registerDataVersion', 'data.version')) return;
      const migrations = definition.migrations ?? [];
      recording.dataVersion = { version, compatibleWith: definition.compatibleWith ?? [], steps: migrations.map((migration) => migration.to) };
      for (const migration of migrations) {
        const path = `data.migrations.${recording.migrations.length}`;
        recording.migrations.push({ to: migration.to, handler: `migration:${migration.to}` });
        recording.bind(`migration:${migration.to}`, `${path}.handler`, migration.up);
      }
    },
    registerCollection(name, definition) {
      open();
      const path = `data.collections.${recording.collections.length}`;
      recording.collectionNames.push(name);
      recording.collections.push(compact({
        name, description: definition.description, schema: recording.jsonSchema(`${path}.schema`, definition.schema),
        idField: definition.idField ?? 'id', indexes: definition.indexes,
      }));
      return reference(name);
    },
    registerLog(name, definition) {
      open();
      const path = `data.logs.${recording.logs.length}`;
      recording.logNames.push(name);
      recording.logs.push(compact({
        prefix: name, description: definition.description, entry: recording.jsonSchema(`${path}.entry`, definition.entry),
      }));
      return reference(name);
    },
    registerEntity(name, definition) {
      open();
      const path = `entities.${recording.entities.length}`;
      const { display } = definition;
      recording.entityNames.push(name);
      recording.entities.push(compact({
        name, description: definition.description, title: definition.title,
        schema: recording.jsonSchema(`${path}.schema`, definition.schema), idField: definition.idField ?? 'id',
        display: compact({
          title: display.title, subtitle: display.subtitle === undefined ? undefined : display.subtitle, icon: display.icon,
        }),
        route: definition.route,
      }));
      return reference(name);
    },
    registerConfig(definition) {
      open();
      if (!recording.firstCall('registerConfig', 'config')) return;
      const schema = recording.jsonSchema('config.schema', definition.schema);
      recording.config = compact({ scope: definition.scope, schema });
    },
  };

  return { ext, close: () => { closed = true; } };
}

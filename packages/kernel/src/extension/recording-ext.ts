import type { Text } from '@kvman/protocol';
import type { Ext, SubscriptionDef } from '@kvman/sdk';
import { compact, reference, type Recording } from './recording.ts';
import { uiRegistrations } from './recording-ui.ts';

export type RecordingExt = { ext: Ext; close(): void };


export function createRecordingExt(recording: Recording, closedError: () => Error): RecordingExt {
  let closed = false;
  const open = (): void => {
    if (closed) throw closedError();
  };

  const ext: Ext = {
    requestCapability(name: string, options: { reason: Text; types?: string[] }) {
      open();
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
      recording.types.push(compact({
        type: name, kind: 'command', description: definition.description,
        input: recording.jsonSchema(`${path}.input`, definition.input, 'input'),
        output: definition.output === undefined ? undefined : recording.jsonSchema(`${path}.output`, definition.output),
        examples: definition.examples, lane: definition.lane, concurrency: definition.concurrency, timeoutMs: definition.timeoutMs,
        maxAttempts: definition.maxAttempts, priority: definition.priority, retention: definition.retention, scope: definition.scope,
        access: definition.access ?? 'all', slash: definition.slash, agentTool: definition.agentTool,
        namingException: definition.namingException, handler: `command:${name}`,
      }));
      recording.bind(`command:${name}`, `${path}.handler`, definition.handle);
      recording.bindHandler(`command:${name}`, definition);
      recording.schemas.handlers.set(`command:${name}`, { input: definition.input, output: definition.output });
      return reference(name);
    },
    registerQuery(name, definition) {
      open();
      const path = `types.${recording.types.length}`;
      recording.types.push(compact({
        type: name, kind: 'query', description: definition.description,
        input: recording.jsonSchema(`${path}.input`, definition.input, 'input'),
        output: recording.jsonSchema(`${path}.output`, definition.output),
        examples: definition.examples, timeoutMs: definition.timeoutMs, access: definition.access ?? 'all',
        agentTool: definition.agentTool, namingException: definition.namingException, handler: `query:${name}`,
      }));
      recording.bind(`query:${name}`, `${path}.handler`, definition.handle);
      recording.bindHandler(`query:${name}`, definition);
      recording.schemas.handlers.set(`query:${name}`, { input: definition.input, output: definition.output });
      return reference(name);
    },
    registerEvent(name, definition) {
      open();
      const path = `types.${recording.types.length}`;
      recording.types.push(compact({
        type: name, kind: 'event', description: definition.description, delivery: definition.delivery ?? 'durable',
        payload: definition.payload === undefined ? undefined : recording.jsonSchema(`${path}.payload`, definition.payload, 'input'),
        chunk: definition.chunk, namingException: definition.namingException,
      }));
      if (definition.payload !== undefined) recording.schemas.events.set(name, definition.payload);
      return reference(name);
    },
    subscribe(event: string, definition: SubscriptionDef) {
      open();
      const path = `subscriptions.${recording.subscriptions.length}`;
      recording.subscriptions.push(compact({
        event, description: definition.description, lane: definition.lane, concurrency: definition.concurrency,
        timeoutMs: definition.timeoutMs, handler: `subscription:${event}`,
      }));
      recording.bind(`subscription:${event}`, `${path}.handler`, definition.handle);
      recording.bindHandler(`subscription:${event}`, definition);
    },
    registerSchedule(name, definition) {
      open();
      recording.schedules.push(compact({
        name, description: definition.description, every: definition.every, cron: definition.cron,
        command: definition.command, payload: definition.payload,
      }));
      return reference(name);
    },
    registerError(code, definition) {
      open();
      recording.errors.push(compact({
        code, description: definition.description, title: definition.title, retryable: definition.retryable ?? false, hint: definition.hint,
      }));
      return reference(code);
    },

    registerDataVersion(version, definition = {}) {
      open();
      if (!recording.firstCall('registerDataVersion', 'data.version')) return;
      const migrations = definition.migrations ?? [];
      recording.dataVersion = { version, compatibleWith: definition.compatibleWith ?? [] };
      for (const migration of migrations) {
        const path = `data.migrations.${recording.migrations.length}`;
        recording.migrations.push({ to: migration.to, handler: `migration:${migration.to}` });
        recording.bind(`migration:${migration.to}`, `${path}.handler`, migration.up);
        recording.bindMigration(migration.to, migration.up);
      }
    },
    registerCollection(name, definition) {
      open();
      const path = `data.collections.${recording.collections.length}`;
      recording.collections.push(compact({
        name, description: definition.description, schema: recording.jsonSchema(`${path}.schema`, definition.schema),
        idField: definition.idField ?? 'id', indexes: definition.indexes,
      }));
      recording.schemas.collections.set(name, definition.schema);
      return reference(name);
    },
    registerLog(name, definition) {
      open();
      const path = `data.logs.${recording.logs.length}`;
      recording.logs.push(compact({
        prefix: name, description: definition.description, entry: recording.jsonSchema(`${path}.entry`, definition.entry),
      }));
      return reference(name);
    },
    registerEntity(name, definition) {
      open();
      const path = `entities.${recording.entities.length}`;
      const { display } = definition;
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
    registerProvider(id, definition) {
      open();
      const index = recording.providers.length;
      if (recording.providerDefinitions.has(id)) {
        recording.issues.push({ path: `llm.providers.${index}`, message: `provider ${id} is already registered`, hint: 'register each provider once' });
        return;
      }
      const functions = [`provider:${id}.complete`, `provider:${id}.status`];
      if (typeof definition.listModels === 'function') functions.push(`provider:${id}.listModels`);
      if (typeof definition.countTokens === 'function') functions.push(`provider:${id}.countTokens`);
      recording.providers.push(compact({
        id, title: definition.title, description: definition.description, auth: definition.auth, functions,
      }));
      recording.bind(`provider:${id}.complete`, `llm.providers.${index}.functions`, definition.complete);
      recording.bind(`provider:${id}.status`, `llm.providers.${index}.functions`, definition.status);
      if (definition.listModels !== undefined) recording.bind(`provider:${id}.listModels`, `llm.providers.${index}.functions`, definition.listModels);
      if (definition.countTokens !== undefined) recording.bind(`provider:${id}.countTokens`, `llm.providers.${index}.functions`, definition.countTokens);
      recording.providerDefinitions.set(id, definition);
    },
    registerModel(id, definition) {
      open();
      const index = recording.models.length;
      if (recording.models.some((model) => model['id'] === id)) {
        recording.issues.push({ path: `llm.models.${index}`, message: `model ${id} is already registered`, hint: 'register each model once' });
        return;
      }
      recording.models.push(compact({ id, ...definition }));
    },

    ...uiRegistrations(recording, open),
  };

  return { ext, close: () => { closed = true; } };
}

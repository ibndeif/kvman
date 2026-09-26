import {
  cancelRequestSchema, cancelResultSchema, extensionGetRequestSchema, extensionGetResultSchema, extensionInstalledSchema, extensionQuarantinedSchema,
  extensionsListRequestSchema, extensionsListResultSchema, extensionUninstalledSchema, healthRequestSchema, healthResultSchema, installRequestSchema,
  installResultSchema, kernelStartedSchema, messageDeadLetteredSchema, presetChangedSchema, schemaDocumentSchema, schemaGetRequestSchema,
  shutdownRequestSchema, shutdownResultSchema, stageRequestSchema, stageResultSchema, toJsonSchemaDocument, uninstallRequestSchema,
  uninstallResultSchema, validateRequestSchema, validateResultSchema, type JsonObject, type SchemaView, type TypeEntry,
} from '@kvman/protocol';

export const kernelOwner = 'kernel';

function jsonDocument(schema: Parameters<typeof toJsonSchemaDocument>[0], view: SchemaView): JsonObject {
  const conversion = toJsonSchemaDocument(schema, view);
  if (!conversion.ok) throw new Error(`a kernel schema does not convert to JSON Schema: ${conversion.message}`);
  return conversion.document;
}

// The kernel.* types of the milestones built so far (ADR 0061); each later milestone adds its own.
export function kernelTypeEntries(): TypeEntry[] {
  return [
    {
      type: 'kernel.message.dead-lettered', kind: 'event', delivery: 'durable',
      description: 'A message failed after its maximum attempts and is dead.',
      payload: jsonDocument(messageDeadLetteredSchema, 'input'),
    },
    {
      type: 'kernel.extension.quarantined', kind: 'event', delivery: 'durable',
      description: 'An extension was quarantined and is unavailable in every workspace.',
      payload: jsonDocument(extensionQuarantinedSchema, 'input'),
    },
    {
      type: 'kernel.cancel', kind: 'command', access: 'all', handler: 'command:kernel.cancel',
      description: 'Cancels a message and everything it caused, or every unfinished message of a correlation.',
      input: jsonDocument(cancelRequestSchema, 'input'), output: jsonDocument(cancelResultSchema, 'output'),
    },
    {
      type: 'kernel.shutdown', kind: 'command', access: 'user', handler: 'command:kernel.shutdown',
      description: 'Shuts the kernel down: running handlers get 10 s to finish, and the rest run again at the next start.',
      input: jsonDocument(shutdownRequestSchema, 'input'), output: jsonDocument(shutdownResultSchema, 'output'),
    },
    {
      type: 'kernel.health.get', kind: 'query', access: 'all', handler: 'query:kernel.health.get',
      description: 'Whether the kernel runs, its version and instance, its port, and its home folder.',
      input: jsonDocument(healthRequestSchema, 'input'), output: jsonDocument(healthResultSchema, 'output'),
    },
    {
      type: 'kernel.schema.get', kind: 'query', access: 'all', handler: 'query:kernel.schema.get',
      description: 'The registry for developers, LLMs, and the builder: types, entities, errors, components, and frame slots, searchable with q.',
      input: jsonDocument(schemaGetRequestSchema, 'input'), output: jsonDocument(schemaDocumentSchema, 'output'),
    },
    {
      type: 'kernel.validate', kind: 'query', access: 'all', handler: 'query:kernel.validate',
      description: 'Checks a manifest, preset, or page against the structural rules and returns every issue with its hint.',
      input: jsonDocument(validateRequestSchema, 'input'), output: jsonDocument(validateResultSchema, 'output'),
    },
    ...extensionLifecycleEntries(),
    {
      type: 'kernel.started', kind: 'event', delivery: 'transient',
      description: 'The kernel finished booting.',
      payload: jsonDocument(kernelStartedSchema, 'input'),
    },
  ];
}

// 03 §3.8, 06 §6.2, §6.8 (M2.2, ADRs 0118–0120).
function extensionLifecycleEntries(): TypeEntry[] {
  return [
    {
      type: 'kernel.extension.stage', kind: 'command', access: 'all', handler: 'command:kernel.extension.stage',
      description: 'Downloads and checks an extension from a source, records its setup in the sandboxed loader, and returns what the grant dialog shows with a confirmation token. Admin only.',
      input: jsonDocument(stageRequestSchema, 'input'), output: jsonDocument(stageResultSchema, 'output'),
    },
    {
      type: 'kernel.extension.install', kind: 'command', access: 'all', handler: 'command:kernel.extension.install',
      description: 'Installs a staged extension by its confirmation token as an immutable snapshot; installing never enables. Admin only.',
      input: jsonDocument(installRequestSchema, 'input'), output: jsonDocument(installResultSchema, 'output'),
    },
    {
      type: 'kernel.extension.uninstall', kind: 'command', access: 'user', handler: 'command:kernel.extension.uninstall',
      description: 'Uninstalls an extension disabled in every workspace, keeping its data unless deleteData is set.',
      input: jsonDocument(uninstallRequestSchema, 'input'), output: jsonDocument(uninstallResultSchema, 'output'),
    },
    {
      type: 'kernel.extensions.list', kind: 'query', access: 'all', handler: 'query:kernel.extensions.list',
      description: 'The installed extensions with their status, active digest, and the workspaces that enable them.',
      input: jsonDocument(extensionsListRequestSchema, 'input'), output: jsonDocument(extensionsListResultSchema, 'output'),
    },
    {
      type: 'kernel.extension.get', kind: 'query', access: 'all', handler: 'query:kernel.extension.get',
      description: 'One installed extension: its versions, its active manifest, and its grants by workspace.',
      input: jsonDocument(extensionGetRequestSchema, 'input'), output: jsonDocument(extensionGetResultSchema, 'output'),
    },
    {
      type: 'kernel.extension.installed', kind: 'event', delivery: 'durable',
      description: 'A new version of an extension was installed.',
      payload: jsonDocument(extensionInstalledSchema, 'input'),
    },
    {
      type: 'kernel.extension.uninstalled', kind: 'event', delivery: 'durable',
      description: 'An extension was uninstalled.',
      payload: jsonDocument(extensionUninstalledSchema, 'input'),
    },
    {
      type: 'kernel.preset.changed', kind: 'event', delivery: 'durable',
      description: "A workspace's applied preset was written: applied, updated, or changed by enable, disable, or uninstall.",
      payload: jsonDocument(presetChangedSchema, 'input'),
    },
  ];
}

// The kernel's events with their payload schemas, which a subscription lane may read (ADR 0109).
export function kernelEventPayloads(): Map<string, JsonObject | undefined> {
  return new Map(kernelTypeEntries().flatMap((entry) => (entry.kind === 'event' ? [[entry.type, entry.payload]] : [])));
}

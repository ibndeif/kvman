import {
  cancelRequestSchema, cancelResultSchema, extensionQuarantinedSchema, healthRequestSchema, healthResultSchema, kernelStartedSchema,
  messageDeadLetteredSchema, shutdownRequestSchema, shutdownResultSchema, toJsonSchemaDocument, type JsonObject, type SchemaView,
  type TypeEntry,
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
      type: 'kernel.started', kind: 'event', delivery: 'transient',
      description: 'The kernel finished booting.',
      payload: jsonDocument(kernelStartedSchema, 'input'),
    },
  ];
}

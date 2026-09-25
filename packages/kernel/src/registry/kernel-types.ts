import {
  cancelRequestSchema, cancelResultSchema, extensionQuarantinedSchema, messageDeadLetteredSchema, toJsonSchemaDocument,
  type JsonObject, type SchemaView, type TypeEntry,
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
  ];
}

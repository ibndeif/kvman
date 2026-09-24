import { messageDeadLetteredSchema, toJsonSchemaDocument, type JsonObject, type TypeEntry } from '@kvman/protocol';

export const kernelOwner = 'kernel';

function payloadDocument(schema: Parameters<typeof toJsonSchemaDocument>[0]): JsonObject {
  const conversion = toJsonSchemaDocument(schema);
  if (!conversion.ok) throw new Error(`a kernel payload schema does not convert to JSON Schema: ${conversion.message}`);
  return conversion.document;
}

// The kernel.* types of the milestones built so far (ADR 0061); each later milestone adds its own.
export function kernelTypeEntries(): TypeEntry[] {
  return [
    {
      type: 'kernel.message.dead-lettered', kind: 'event', delivery: 'durable',
      description: 'A message failed after its maximum attempts and is dead.',
      payload: payloadDocument(messageDeadLetteredSchema),
    },
  ];
}

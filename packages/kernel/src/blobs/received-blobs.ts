import { replyPayloadSchema, type Json, type JsonObject, type Message } from '@kvman/protocol';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { Connection } from '../storage/driver.ts';
import { blobIdsIn } from './blob-fields.ts';

function schemaOf(registry: KernelRegistry, message: Pick<Message, 'type' | 'workspaceId'>, part: 'input' | 'output'): JsonObject | undefined {
  const lookup = registry.lookup(message.type, message.workspaceId);
  if (!lookup.ok) return undefined;
  const { entry } = lookup.resolved;
  if (entry.kind === 'event') return part === 'input' ? entry.payload : undefined;
  return part === 'input' ? entry.input : entry.output;
}

// A continuation's payload is `{ reply, context }` (02 §2.8); its reply's value has the replied command's output schema.
function continuationBlobs(registry: KernelRegistry, connection: Connection, message: Message): string[] {
  const { causationId, payload } = message;
  if (message.source !== 'kernel' || causationId === undefined || message.idempotencyKey !== `${causationId}:reply`) return [];
  const replied = connection.prepare('SELECT type, workspace_id FROM messages WHERE id = ?').get(causationId);
  const reply = typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? replyPayloadSchema.safeParse(payload['reply']) : undefined;
  if (replied === undefined || reply === undefined || !reply.success || !reply.data.ok) return [];
  const workspaceId = replied['workspace_id'];
  const command = { type: String(replied['type']), ...(typeof workspaceId === 'string' ? { workspaceId } : {}) };
  return blobIdsIn(schemaOf(registry, command, 'output'), reply.data.value);
}

// ADR 0134: the blob IDs a handler receives with the message it handles: its payload's z.blobId() fields, and for a
// continuation the reply's.
export function receivedWith(registry: KernelRegistry, connection: Connection, message: Message): Set<string> {
  return new Set([...blobIdsIn(schemaOf(registry, message, 'input'), message.payload), ...continuationBlobs(registry, connection, message)]);
}

// A ctx.command reply or a ctx.query result hands over its output's z.blobId() fields.
export function receivedFrom(registry: KernelRegistry, call: { type: string; workspaceId: string | undefined }, value: Json): string[] {
  const target = { type: call.type, ...(call.workspaceId === undefined ? {} : { workspaceId: call.workspaceId }) };
  return blobIdsIn(schemaOf(registry, target, 'output'), value);
}

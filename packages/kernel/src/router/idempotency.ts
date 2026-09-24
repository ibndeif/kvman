import { createHash } from 'node:crypto';
import { canonicalJson, replyPayloadSchema, requestDigestFields, type RequestDigestInput } from '@kvman/protocol';
import type { OriginalMessage } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { storedState } from '../storage/message-rows.ts';
import { jsonOf } from '../store/json-order.ts';

export function requestDigestNow(input: RequestDigestInput): string {
  return createHash('sha256').update(canonicalJson(requestDigestFields(input))).digest('hex');
}

export type KeyedMessage = OriginalMessage & { digest: string | undefined };

export function findKeyedMessage(connection: Connection, source: string, key: string): KeyedMessage | undefined {
  const row = connection
    .prepare('SELECT id, state, digest, result FROM messages WHERE idempotency_source = ? AND idempotency_key = ?')
    .get(source, key);
  if (row === undefined) return undefined;
  const reply = row['result'] === null ? undefined : replyPayloadSchema.parse(jsonOf(row['result']));
  return {
    id: String(row['id']), state: storedState(row['state']), digest: typeof row['digest'] === 'string' ? row['digest'] : undefined,
    ...(reply === undefined ? {} : { reply }),
  };
}

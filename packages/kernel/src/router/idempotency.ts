import { createHash } from 'node:crypto';
import { canonicalJson, replyPayloadSchema, requestDigestFields, type RequestDigestInput } from '@kvman/protocol';
import type { OriginalMessage } from '../storage/commit-unit.ts';
import { storedState } from '../storage/message-rows.ts';
import { storedReplyText, type RowReader } from '../storage/stored-message.ts';
import { jsonOf } from '../store/json-order.ts';

export function requestDigestNow(input: RequestDigestInput): string {
  return createHash('sha256').update(canonicalJson(requestDigestFields(input))).digest('hex');
}

export type KeyedMessage = OriginalMessage & { digest: string | undefined };

export function findKeyedMessage(rows: RowReader, source: string, key: string): KeyedMessage | undefined {
  const row = rows.connection
    .prepare('SELECT id, state, digest, result, result_ref FROM messages WHERE idempotency_source = ? AND idempotency_key = ?')
    .get(source, key);
  if (row === undefined) return undefined;
  const text = storedReplyText(rows.files, row);
  const reply = text === undefined ? undefined : replyPayloadSchema.parse(jsonOf(text));
  return {
    id: String(row['id']), state: storedState(row['state']), digest: typeof row['digest'] === 'string' ? row['digest'] : undefined,
    ...(reply === undefined ? {} : { reply }),
  };
}

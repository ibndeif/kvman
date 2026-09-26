import { storeReadSchema, type StoreRead } from '@kvman/protocol';

// The messages between the kernel and its read pool threads, both kernel code (ADR 0131).
export type PoolRequest = { id: number; owner: string; ws: string; read: StoreRead };

// A read answers its value as JSON bytes, or the detail of a filter the database cannot run.
export type PoolReply = { id: number; ok: true; value: Uint8Array } | { id: number; ok: false; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function poolRequestOf(value: unknown): PoolRequest {
  if (isRecord(value) && typeof value['id'] === 'number' && typeof value['owner'] === 'string' && typeof value['ws'] === 'string') {
    return { id: value['id'], owner: value['owner'], ws: value['ws'], read: storeReadSchema.parse(value['read']) };
  }
  throw new Error('a read pool request is { id, owner, ws, read }');
}

export function poolReplyOf(value: unknown): PoolReply {
  if (isRecord(value) && typeof value['id'] === 'number') {
    if (value['ok'] === true && value['value'] instanceof Uint8Array) return { id: value['id'], ok: true, value: value['value'] };
    if (value['ok'] === false && typeof value['detail'] === 'string') return { id: value['id'], ok: false, detail: value['detail'] };
  }
  throw new Error('a read pool reply is { id, ok, value | detail }');
}

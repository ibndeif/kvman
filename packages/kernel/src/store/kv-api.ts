import { compareByCodePoint, jsonByteLength, type Json } from '@kvman/protocol';
import type { KvEntry, KvStore } from '@kvman/sdk';
import { readScopeOf, requireWritable, storeFailure, storeLimits, tooLarge, type ScopeBinding } from './store-context.ts';

export function createKvStore(binding: ScopeBinding): KvStore {
  const { context, scope } = binding;
  const { reader, pending } = context;
  const at = readScopeOf(binding);
  return {
    async get<Value extends Json = Json>(key: string) {
      const buffered = pending.kv(scope, key);
      if (buffered !== undefined) return (buffered.deleted ? undefined : buffered.value) as Value | undefined;
      const stored = await reader.kvGet(at, key);
      pending.noteKvVersion(scope, key, stored?.version ?? 0);
      return stored?.value as Value | undefined;
    },
    set(key, value) {
      requireWritable(context);
      if (jsonByteLength(value) > storeLimits.kvValueBytes) {
        throw storeFailure(context, 'PAYLOAD_TOO_LARGE', { params: { limit: 'kv-value', max: storeLimits.kvValueBytes } });
      }
      pending.setKv(scope, key, { deleted: false, value });
    },
    delete(key) {
      requireWritable(context);
      pending.setKv(scope, key, { deleted: true });
    },
    async list<Value extends Json = Json>(prefix: string) {
      const buffered = pending.kvEntries(scope).filter((entry) => entry.key.startsWith(prefix));
      const stored = await reader.kvList(at, prefix, storeLimits.resultRows + buffered.length + 1);
      for (const row of stored) pending.noteKvVersion(scope, row.key, row.version);
      const merged = new Map<string, Json>(stored.map((row) => [row.key, row.value]));
      for (const { key, pending: value } of buffered) {
        if (value.deleted) merged.delete(key);
        else merged.set(key, value.value);
      }
      const entries = [...merged.entries()].sort(([left], [right]) => compareByCodePoint(left, right)).map(([key, value]) => ({ key, value }));
      if (entries.length > storeLimits.resultRows || jsonByteLength(entries) > storeLimits.resultBytes) throw tooLarge(context, `kv entries starting with "${prefix}"`);
      return entries as Array<KvEntry<Value>>;
    },
  };
}

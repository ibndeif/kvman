import { jsonByteLength, type Json } from '@kvman/protocol';
import type { Log, LogEntry, LogRange } from '@kvman/sdk';
import { readScopeOf, requireWritable, storeFailure, storeLimits, tooLarge, type ScopeBinding, type StoreContext } from './store-context.ts';

const endOfLog = Number.MAX_SAFE_INTEGER;

function checkedRange(context: StoreContext, range: LogRange): Required<LogRange> {
  for (const [field, value] of Object.entries(range)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw storeFailure(context, 'VALIDATION_FAILED', { issues: [{ path: field, message: `${field} is a non-negative integer` }] });
    }
  }
  return { after: range.after ?? 0, before: range.before ?? endOfLog, last: range.last ?? endOfLog };
}

export function createLog(binding: ScopeBinding, name: string): Log {
  const { context, scope } = binding;
  const { reader, pending } = context;
  const at = readScopeOf(binding);

  const read = async (range: Required<LogRange>): Promise<Array<LogEntry<Json>>> => {
    const buffered = pending.log(scope, name);
    const after = Math.max(range.after, buffered.truncatedBefore - 1);
    const appended = buffered.appended.filter((entry) => entry.seq > after && entry.seq < range.before);
    const storedLimit = range.last === endOfLog ? storeLimits.resultRows + 1 : range.last;
    const stored = buffered.dropped
      ? []
      : range.last === endOfLog
        ? await reader.logRead(at, name, after, range.before, storedLimit)
        : await reader.logReadNewest(at, name, after, range.before, storedLimit);
    const entries = [...stored, ...appended].slice(-range.last);
    if (entries.length > storeLimits.resultRows || jsonByteLength(entries) > storeLimits.resultBytes) throw tooLarge(context, `the log ${name}`);
    return entries;
  };

  return {
    async append(value) {
      requireWritable(context);
      const seq = (await reader.logLastSeq(at, name)) + pending.log(scope, name).appended.length + 1;
      pending.appendLog(scope, name, seq, value);
      return seq;
    },
    async read(range = {}) {
      return read(checkedRange(context, range));
    },
    async last() {
      return (await read({ after: 0, before: endOfLog, last: 1 }))[0];
    },
    truncateBefore(seq) {
      requireWritable(context);
      pending.truncateLog(scope, name, seq);
    },
    drop() {
      requireWritable(context);
      pending.dropLog(scope, name);
    },
  };
}

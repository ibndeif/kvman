import type { LlmUsageGetRequest, LlmUsageRow } from '@kvman/protocol';

export type UsageRecord = {
  ws: string;
  caller: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number | null;
  at: number;
};

export type UsageGroupBy = NonNullable<LlmUsageGetRequest['groupBy']>;

function keyOf(record: UsageRecord, groupBy: UsageGroupBy): string {
  if (groupBy === 'model') return `${record.provider}/${record.model}`;
  if (groupBy === 'extension') return record.caller;
  const date = new Date(record.at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ADR 0154: usage rows aggregated by the groupBy key, sorted by key; without groupBy one total row with a null key.
// From is inclusive and to exclusive on the row's at; a missing cost counts 0.
export function groupUsage(
  records: readonly UsageRecord[],
  options: { from?: number; to?: number; groupBy?: UsageGroupBy },
): LlmUsageRow[] {
  const inRange = records.filter(
    (record) => (options.from === undefined || record.at >= options.from) && (options.to === undefined || record.at < options.to),
  );
  const zero = (): LlmUsageRow => ({ key: null, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });
  if (options.groupBy === undefined) {
    const total = zero();
    for (const record of inRange) {
      total.calls += 1;
      total.input += record.input;
      total.output += record.output;
      total.cacheRead += record.cacheRead;
      total.cacheWrite += record.cacheWrite;
      total.costUsd += record.costUsd ?? 0;
    }
    return [total];
  }
  const { groupBy } = options;
  const grouped = new Map<string, LlmUsageRow>();
  for (const record of inRange) {
    const key = keyOf(record, groupBy);
    const row = grouped.get(key) ?? { key, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
    row.calls += 1;
    row.input += record.input;
    row.output += record.output;
    row.cacheRead += record.cacheRead;
    row.cacheWrite += record.cacheWrite;
    row.costUsd += record.costUsd ?? 0;
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((left, right) => (left.key ?? '') < (right.key ?? '') ? -1 : 1);
}

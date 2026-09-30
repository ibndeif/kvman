import { z, type Ctx } from '@kvman/sdk';
import type { CallUsage } from '../schemas/complete.ts';

// Per-workspace, per-model usage totals in kvai's workspace store (plan 07 §7.1, ADR 0003, 9): each call adds its tokens
// and cost; there's no per-call history. A store page holds at most 1000 models.

const pageLimit = 1000;

/** A model's totals in a workspace. */
export const usageRowSchema = z.object({
  model: z.string(),
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cost: z.number(),
});

export type UsageRow = z.output<typeof usageRowSchema>;

/** A workspace's totals over every model: all tokens, and the cost in US dollars. */
export const usageTotalSchema = z.object({ tokens: z.number(), cost: z.number() });

export function addUsage(ctx: Ctx, model: string, usage: CallUsage): Promise<void> {
  return ctx.store.transaction((tx) => {
    const totals = tx.collection('usage', usageRowSchema);
    const [known] = totals.find({ model }, { limit: 1 });
    if (known === undefined) {
      totals.insert({ model, ...usage });
      return;
    }
    totals.update(known.id, {
      input: known.input + usage.input,
      output: known.output + usage.output,
      cacheRead: known.cacheRead + usage.cacheRead,
      cacheWrite: known.cacheWrite + usage.cacheWrite,
      cost: known.cost + usage.cost,
    });
  });
}

export async function usageRows(ctx: Ctx): Promise<UsageRow[]> {
  const rows = await ctx.store.collection('usage', usageRowSchema).find({}, { limit: pageLimit });
  return rows.map(({ model, input, output, cacheRead, cacheWrite, cost }) => ({ model, input, output, cacheRead, cacheWrite, cost }));
}

export async function usageTotal(ctx: Ctx): Promise<z.output<typeof usageTotalSchema>> {
  const rows = await usageRows(ctx);
  return {
    tokens: rows.reduce((sum, row) => sum + row.input + row.output + row.cacheRead + row.cacheWrite, 0),
    cost: rows.reduce((sum, row) => sum + row.cost, 0),
  };
}

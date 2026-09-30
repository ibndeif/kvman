import { z, type Ctx } from '@kvman/sdk';
import { usageRows, usageRowSchema, usageTotal, usageTotalSchema } from './usage/usage-totals.ts';

// The workspace's usage (plan 07 §7.2, ADR 0009, 60): per model, and summed for the status item.

export function registerUsage(ctx: Ctx): void {
  ctx.registerQuery('kvai.usage.get', {
    description: "Lists this workspace's tokens and cost per model.",
    input: z.object({}),
    output: z.array(usageRowSchema),
    public: true,
    handle: () => usageRows(ctx),
  });
  ctx.registerQuery('kvai.usage.total.get', {
    description: "Gives this workspace's tokens and cost over every model.",
    input: z.object({}),
    output: usageTotalSchema,
    public: true,
    handle: () => usageTotal(ctx),
  });
}

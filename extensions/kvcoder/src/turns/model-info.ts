import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvai';

// What kvai says about a model: its context window and whether it takes images.

export type ModelInfo = { contextWindow: number; images: boolean };

export async function modelInfo(ctx: Ctx, model: string | null): Promise<ModelInfo | undefined> {
  if (model === null) return undefined;
  const provider = model.slice(0, model.indexOf('/'));
  if (provider === '') return undefined;
  const found = (await ctx.exec('kvai.model.list', { provider })).find((candidate) => candidate.id === model);
  return found === undefined ? undefined : { contextWindow: found.contextWindow, images: found.input.includes('image') };
}

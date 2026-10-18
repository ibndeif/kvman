import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import { nearestLevel, type ThinkingLevel } from '../thinking-levels.ts';

// What kvai says about a model: its context window, whether it takes images, and its thinking levels.

export type ModelInfo = { contextWindow: number; images: boolean; thinkingLevels: ThinkingLevel[] };

export async function modelInfo(ctx: Ctx, model: string | null): Promise<ModelInfo | undefined> {
  if (model === null) return undefined;
  const provider = model.slice(0, model.indexOf('/'));
  if (provider === '') return undefined;
  const found = (await ctx.exec('kvai.model.list', { provider })).find((candidate) => candidate.id === model);
  return found === undefined ? undefined : { contextWindow: found.contextWindow, images: found.input.includes('image'), thinkingLevels: found.thinkingLevels };
}

/** The level a session on `model` keeps for `wanted`: the nearest the model has, or `wanted` for a model kvai doesn't list (ADR 0087, 11). */
export async function levelFor(ctx: Ctx, model: string | null, wanted: ThinkingLevel): Promise<ThinkingLevel> {
  const info = await modelInfo(ctx, model);
  return info === undefined ? wanted : nearestLevel(info.thinkingLevels, wanted);
}

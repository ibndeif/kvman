import type { LlmResult, ModelInfo } from '@kvman/protocol';

const perMillion = 1_000_000;

// 05 §5.11, ADR 0153: the provider's cost, else the model's prices × tokens (cache tokens unpriced), else none.
export function costOf(result: Pick<LlmResult, 'costUsd' | 'usage'>, model: Pick<ModelInfo, 'cost'> | undefined): number | null {
  if (result.costUsd !== undefined) return result.costUsd;
  if (model?.cost === undefined) return null;
  return (result.usage.input * model.cost.inputPerMTok + result.usage.output * model.cost.outputPerMTok) / perMillion;
}

import type { LlmDefaults, LlmRequest, ModelInfo } from '@kvman/protocol';

export type ModelResolution =
  | { ok: true; model: ModelInfo }
  | { ok: false; code: 'LLM_NOT_CONFIGURED' | 'LLM_MODEL_NOT_FOUND' | 'LLM_THINKING_UNSUPPORTED'; detail: string };

export type ResolutionInput = {
  request: Pick<LlmRequest, 'purpose' | 'model' | 'thinking'>;
  providers: ReadonlySet<string>;
  models: readonly ModelInfo[];
  workspace: LlmDefaults;
  global: LlmDefaults;
};

// 03 §3.12, ADR 0153: explicit model, then the workspace default for the purpose, then the global one; the model must
// be one of the enabled providers', and a thinking level other than `off` must be one it supports.
export function resolveModel(input: ResolutionInput): ModelResolution {
  const { request, providers, models } = input;
  if (providers.size === 0) return { ok: false, code: 'LLM_NOT_CONFIGURED', detail: 'no LLM provider is enabled for this call' };
  const reference = request.model ?? input.workspace[request.purpose] ?? input.global[request.purpose];
  if (reference === undefined) return { ok: false, code: 'LLM_MODEL_NOT_FOUND', detail: `no model is set for the purpose ${request.purpose}` };
  const model = models.find((candidate) => candidate.provider === reference.provider && candidate.id === reference.id);
  if (model === undefined) return { ok: false, code: 'LLM_MODEL_NOT_FOUND', detail: `no enabled provider has the model ${reference.provider}/${reference.id}` };
  const { thinking } = request;
  if (thinking !== undefined && thinking !== 'off' && !model.capabilities.thinking.includes(thinking)) {
    return { ok: false, code: 'LLM_THINKING_UNSUPPORTED', detail: `${model.provider}/${model.id} does not support thinking ${thinking}` };
  }
  return { ok: true, model };
}

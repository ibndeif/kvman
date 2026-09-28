import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '@kvman/protocol';
import { resolveModel } from '../../src/llm/model-resolution.ts';

function model(provider: string, id: string, thinking: string[] = []): ModelInfo {
  return {
    provider, id, extension: `@acme/${provider}`, source: 'static', title: `${provider} ${id}`, description: `${provider} ${id}`,
    contextWindow: 8000, maxOutput: 1000,
    capabilities: { tools: false, vision: false, thinking: thinking as ModelInfo['capabilities']['thinking'] },
  };
}

const fake = model('fake', 'fake-model', ['low', 'medium', 'high']);
const other = model('other', 'other-model');

describe('model resolution (03 §3.12, ADR 0153)', () => {
  it('M2.9-E1 resolveModel prefers the explicit model, then workspace, then global defaults', () => {
    const models = [fake, other];
    const providers = new Set(['fake', 'other']);
    expect(resolveModel({
      request: { purpose: 'chat', model: { provider: 'other', id: 'other-model' } },
      providers, models, workspace: { chat: { provider: 'fake', id: 'fake-model' } }, global: { chat: { provider: 'other', id: 'other-model' } },
    })).toEqual({ ok: true, model: other });
    expect(resolveModel({
      request: { purpose: 'chat' }, providers, models,
      workspace: { chat: { provider: 'fake', id: 'fake-model' } }, global: { chat: { provider: 'other', id: 'other-model' } },
    })).toEqual({ ok: true, model: fake });
    expect(resolveModel({
      request: { purpose: 'chat' }, providers, models,
      workspace: {}, global: { chat: { provider: 'other', id: 'other-model' } },
    })).toEqual({ ok: true, model: other });
    expect(resolveModel({
      request: { purpose: 'summary' }, providers, models, workspace: {}, global: {},
    })).toMatchObject({ ok: false, code: 'LLM_MODEL_NOT_FOUND' });
    expect(resolveModel({
      request: { purpose: 'chat', model: { provider: 'fake', id: 'nope' } }, providers, models, workspace: {}, global: {},
    })).toMatchObject({ ok: false, code: 'LLM_MODEL_NOT_FOUND' });
    expect(resolveModel({
      request: { purpose: 'chat' }, providers: new Set(), models: [], workspace: {}, global: {},
    })).toMatchObject({ ok: false, code: 'LLM_NOT_CONFIGURED' });
    expect(resolveModel({
      request: { purpose: 'chat', model: { provider: 'other', id: 'other-model' }, thinking: 'high' },
      providers, models, workspace: {}, global: {},
    })).toMatchObject({ ok: false, code: 'LLM_THINKING_UNSUPPORTED' });
    expect(resolveModel({
      request: { purpose: 'chat', model: { provider: 'other', id: 'other-model' }, thinking: 'off' },
      providers, models, workspace: {}, global: {},
    })).toEqual({ ok: true, model: other });
  });
});

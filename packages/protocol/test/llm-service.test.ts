import { describe, expect, it } from 'vitest';
import {
  hostToKernelFrameSchema, kernelToHostFrameSchema, listedModelSchema, llmDefaultsGetRequestSchema, llmDefaultsGetResultSchema,
  llmDefaultsSchema, llmDefaultsSetRequestSchema, llmDefaultsSetResultSchema, llmModelsChangedSchema, llmModelsListRequestSchema,
  llmModelsListResultSchema, llmModelsRefreshRequestSchema, llmModelsRefreshResultSchema, llmProviderListingSchema, llmProvidersListRequestSchema,
  llmProvidersListResultSchema, llmTokensCountResultSchema, llmUsageGetRequestSchema, llmUsageGetResultSchema, llmUsageRowSchema, llmDefaultsChangedSchema, modelInfoSchema, provideFrameSchema,
  providedFrameSchema, providerDeltaFrameSchema, providerStatusSchema,
} from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';
import { messageId, validationProblem, workspaceId } from './fixtures.ts';

const modelRef = { provider: 'fake', id: 'fake-model' };

const modelInfo = {
  provider: 'lister',
  title: 'Lister Static',
  description: 'A static lister model.',
  contextWindow: 8000,
  maxOutput: 1000,
  cost: { inputPerMTok: 0, outputPerMTok: 0 },
  capabilities: { tools: false, vision: false, thinking: [] },
  id: 'lister-static',
  extension: '@acme/lister-llm',
  source: 'static',
};

const provide = {
  frame: 'provide',
  invocationId: 'p-1',
  extension: '@acme/lister-llm',
  provider: 'lister',
  function: 'complete',
  input: { purpose: 'chat', messages: [{ role: 'user', content: 'hi' }] },
  workspace: { id: workspaceId, path: '/w/a', name: 'A' },
  deadlineAt: 1_790_000_060_000,
  correlationId: messageId,
};

describe('LLM service shapes (plan 03 §§3.8, 3.12, ADRs 0152–0154)', () => {
  it('M2.9-E4 every service schema round-trips its example and refuses near misses', () => {
    expectRoundTrip(modelInfoSchema, modelInfo);
    expectRoundTrip(llmDefaultsSchema, { chat: modelRef });
    expectRoundTrip(llmDefaultsSchema, {});
    expectRoundTrip(llmProvidersListRequestSchema, { workspaceId });
    expectRoundTrip(llmProviderListingSchema, {
      id: 'lister', title: 'Lister', extension: '@acme/lister-llm', auth: 'none', configured: true,
    });
    expectRoundTrip(llmModelsListRequestSchema, {});
    expectRoundTrip(llmModelsListRequestSchema, { workspaceId });
    expectRoundTrip(llmDefaultsGetRequestSchema, {});
    expectRoundTrip(llmDefaultsGetRequestSchema, { workspaceId });
    expectRoundTrip(llmDefaultsGetResultSchema, { workspace: { chat: modelRef }, global: {}, effective: { chat: modelRef } });
    expectRoundTrip(llmDefaultsSetRequestSchema, { workspaceId, purpose: 'chat', model: modelRef });
    expectRoundTrip(llmDefaultsSetRequestSchema, { purpose: 'summary', model: null });
    expectRoundTrip(llmDefaultsSetResultSchema, {});
    expectRoundTrip(llmTokensCountResultSchema, { tokens: 42, exact: true });
    expectRoundTrip(llmTokensCountResultSchema, { tokens: 7, exact: false });
    expectRoundTrip(llmUsageGetRequestSchema, {});
    expectRoundTrip(llmUsageGetRequestSchema, { workspaceId, from: 1, to: 2, groupBy: 'model' });
    expectRoundTrip(llmUsageRowSchema, {
      key: 'fake/fake-model', calls: 3, input: 3000, output: 1500, cacheRead: 0, cacheWrite: 0, costUsd: 0.009,
    });
    expectRoundTrip(llmUsageRowSchema, {
      key: null, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0,
    });
    expectRoundTrip(llmModelsRefreshRequestSchema, {});
    expectRoundTrip(llmModelsRefreshRequestSchema, { provider: 'lister' });
    expectRoundTrip(llmModelsRefreshResultSchema, {});
    expectRoundTrip(llmModelsListResultSchema, [modelInfo]);
    expectRoundTrip(llmProvidersListResultSchema, [{ id: 'lister', title: 'Lister', extension: '@acme/lister-llm', auth: 'none', configured: false }]);
    expectRoundTrip(llmUsageGetResultSchema, { rows: [{ key: null, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }] });
    expectRoundTrip(llmModelsChangedSchema, {});
    expectRoundTrip(llmModelsChangedSchema, { provider: 'lister' });
    expectRoundTrip(llmDefaultsChangedSchema, {});
    expectRoundTrip(llmDefaultsChangedSchema, { workspaceId });
    expectRoundTrip(providerStatusSchema, { configured: true });
    expectRoundTrip(providerStatusSchema, { configured: false });
    expectRoundTrip(listedModelSchema, {
      id: 'lister-a', title: 'Lister A', description: 'A listed model.', contextWindow: 8000, maxOutput: 1000,
      capabilities: { tools: false, vision: false, thinking: [] },
    });

    expectRoundTrip(provideFrameSchema, provide);
    expectRoundTrip(provideFrameSchema, { ...provide, workspace: null });
    const delta = { frame: 'provider.delta', invocationId: 'p-1', text: 'Hel' };
    expectRoundTrip(providerDeltaFrameSchema, delta);
    expectRoundTrip(providerDeltaFrameSchema, { frame: 'provider.delta', invocationId: 'p-1', thinking: 'hmm' });
    const provided = { frame: 'provided', invocationId: 'p-1', outcome: { ok: true, value: { content: 'ok' } } };
    expectRoundTrip(providedFrameSchema, provided);
    expectRoundTrip(providedFrameSchema, { frame: 'provided', invocationId: 'p-1', outcome: { ok: false, problem: validationProblem } });

    expect(kernelToHostFrameSchema.parse(provide)).toEqual(provide);
    expect(hostToKernelFrameSchema.parse(delta)).toEqual(delta);
    expect(hostToKernelFrameSchema.parse(provided)).toEqual(provided);

    // Zod reports an unrecognized key at the object's own path.
    expect(issuePaths(modelInfoSchema, { ...modelInfo, extra: 1 })).toEqual(['']);
    expect(issuePaths(provideFrameSchema, { ...provide, function: 'run' })).toEqual(['function']);
    expect(issuePaths(llmUsageGetRequestSchema, { groupBy: 'hour' })).toEqual(['groupBy']);
  });
});

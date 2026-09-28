import {
  llmDefaultsChangedSchema, llmDefaultsGetRequestSchema, llmDefaultsGetResultSchema, llmDefaultsSetRequestSchema, llmDefaultsSetResultSchema,
  llmModelsChangedSchema, llmModelsListRequestSchema, llmModelsListResultSchema, llmModelsRefreshRequestSchema, llmModelsRefreshResultSchema,
  llmProvidersListRequestSchema, llmProvidersListResultSchema, llmRequestSchema, llmResultSchema, llmTokensCountResultSchema, llmUsageGetRequestSchema,
  llmUsageGetResultSchema, type TypeEntry,
} from '@kvman/protocol';
import { command, event, query } from './kernel-workspace-types.ts';

// 03 §3.8, §3.12 (M2.9, ADRs 0152–0154).
export function llmEntries(): TypeEntry[] {
  return [
    command('kernel.llm.complete', 'all', "Completes an LLM request with the resolved model through the provider's extension; capability llm.", llmRequestSchema, llmResultSchema),
    command('kernel.llm.models.refresh', 'all', "Refreshes one provider's models, or every provider's; admin only.", llmModelsRefreshRequestSchema, llmModelsRefreshResultSchema),
    command('kernel.llm.defaults.set', 'all', 'Sets an LLM default for a purpose, in a workspace or globally; admin only.', llmDefaultsSetRequestSchema, llmDefaultsSetResultSchema),
    query('kernel.llm.providers.list', 'The providers enabled in a workspace, each with whether it is configured.', llmProvidersListRequestSchema, llmProvidersListResultSchema),
    query('kernel.llm.models.list', 'The models of the providers enabled in a workspace, by provider then id.', llmModelsListRequestSchema, llmModelsListResultSchema),
    query('kernel.llm.defaults.get', 'The workspace, global, and effective LLM defaults by purpose.', llmDefaultsGetRequestSchema, llmDefaultsGetResultSchema),
    query('kernel.llm.tokens.count', "Counts an LLM request's tokens with the provider, else estimates them; capability llm.", llmRequestSchema, llmTokensCountResultSchema),
    query('kernel.llm.usage.get', 'The LLM usage rows in range, grouped or totaled, sorted by key.', llmUsageGetRequestSchema, llmUsageGetResultSchema),
    event('kernel.llm.models.changed', "A provider's models were refreshed.", llmModelsChangedSchema),
    event('kernel.llm.defaults.changed', 'The LLM defaults were written, in a workspace or globally.', llmDefaultsChangedSchema),
  ];
}

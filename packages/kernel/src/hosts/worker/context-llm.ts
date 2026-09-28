import { llmResultSchema, llmTokensCountResultSchema, modelInfoSchema } from '@kvman/protocol';
import type { Ctx, LlmAccess } from '@kvman/sdk';

export type LlmParts = { command: Ctx['command']; query: Ctx['query']; workspaceId: string | undefined };

// ctx.llm (05 §5.11, ADR 0153): models through the kernel's LLM service, answered with the protocol's schemas.
// The kernel serves the `kernel.llm.*` types in the next slice; until then these calls fail at admission.
export function createLlm({ command, query, workspaceId }: LlmParts): { llm: LlmAccess } {
  return {
    llm: {
      complete: async (request) => llmResultSchema.parse(await command('kernel.llm.complete', request)),
      countTokens: async (request) => llmTokensCountResultSchema.parse(await query('kernel.llm.tokens.count', request)).tokens,
      models: async () => modelInfoSchema.array().parse(await query('kernel.llm.models.list', workspaceId === undefined ? {} : { workspaceId })),
    },
  };
}

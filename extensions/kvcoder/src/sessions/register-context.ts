import { z, type Ctx } from '@kvman/sdk';
import { sessionTools } from '../prompt/session-prompt.ts';
import { readSettings } from '../register-settings.ts';
import { promptTokens } from '../turns/compaction.ts';
import { sentHistory } from '../turns/model-context.ts';
import { modelInfo } from '../turns/model-info.ts';
import { findSession } from './session-lookup.ts';

// `kvcoder.context.get` (plan 08 §8.6; ADR 0034, 9): how full the model's window is, by compaction's own count.

export function registerContext(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.context.get', {
    description: "Gives the size of a session's prompt in tokens, its model's context window, and the share at which older messages are summarized.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({ tokens: z.number().int().nonnegative(), window: z.number().int().positive().nullable(), compactAt: z.number() }),
    public: true,
    handle: async ({ sessionId }) => {
      const session = await findSession(ctx, sessionId);
      const [tools, settings, info] = await Promise.all([sessionTools(ctx, session), readSettings(ctx), modelInfo(ctx, session.model)]);
      const tokens = promptTokens(tools.built.prompt, await sentHistory(ctx, session.id, session.nextSeq));
      return { tokens: Math.round(tokens), window: info?.contextWindow ?? null, compactAt: settings.compactAt };
    },
  });
}

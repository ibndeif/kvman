import { z, type Ctx } from '@kvman/sdk';
import { sessionTools } from '../prompt/session-prompt.ts';
import { readSettings } from '../register-settings.ts';
import { promptBasis, promptTokens } from '../turns/compaction.ts';
import { sentHistory } from '../turns/model-context.ts';
import { modelInfo } from '../turns/model-info.ts';
import { findSession } from './session-lookup.ts';

// `kvcoder.context.get` (plan 08 §8.6; ADR 0034, 9): how full the model's window is, by compaction's own count, and
// whether that count is the provider's or an estimate (ADR 0058, 2).

export function registerContext(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.context.get', {
    description: "Gives the size of a session's prompt in tokens, its model's context window, and the share at which older messages are summarized.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({ tokens: z.number().int().nonnegative(), window: z.number().int().positive().nullable(), compactAt: z.number(), estimated: z.boolean() }),
    public: true,
    handle: async ({ sessionId }) => {
      const session = await findSession(ctx, sessionId);
      const [tools, settings, info] = await Promise.all([sessionTools(ctx, session), readSettings(ctx), modelInfo(ctx, session.model)]);
      const size = promptTokens(tools.built.prompt, await sentHistory(ctx, session.id, session.nextSeq), { model: session.model, basis: promptBasis(tools.built.prompt, tools.listed.map((listed) => listed.name)) });
      return { tokens: Math.round(size.tokens), window: info?.contextWindow ?? null, compactAt: settings.compactAt, estimated: size.estimated };
    },
  });
}

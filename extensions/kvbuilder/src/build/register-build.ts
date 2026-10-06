import { z, type Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { docsConnector } from '../connectors/docs.ts';
import { extConnector } from '../connectors/ext.ts';
import { kvmanConnector } from '../connectors/kvman.ts';
import { presetConnector } from '../connectors/preset.ts';
import { previewConnector } from '../connectors/preview.ts';
import { readGuide } from '../docs/own-docs.ts';

// `/build-kvman` (plan 09 §9.4; ADR 0027, 12): the person starts building kvman in a chat; the agent never does. The
// connectors are enabled first, so a session that kvcoder refuses leaves nothing behind.

// kvbuilder's connectors, which a chat has only after `/build-kvman` ran in it.
const connectorNames = [kvmanConnector, extConnector, presetConnector, previewConnector, docsConnector].map((connector) => connector.name);

const owner = '@kvman/kvbuilder';

export function registerBuild(ctx: Ctx): void {
  ctx.registerCommand('kvbuilder.build.start', {
    description: "Starts building kvman in one chat: gives the chat kvbuilder's connectors and its guide.",
    public: true,
    retries: 0,
    input: z.object({
      sessionId: z.string().min(1).describe('The chat to build kvman in.'),
      argument: z.string().describe('The text after /build-kvman; the send box sends it as the message.'),
    }),
    output: z.object({}),
    handle: async ({ sessionId }) => {
      await ctx.exec('kvcoder.connector.enable', { sessionId, names: connectorNames });
      const sections = await ctx.exec('kvcoder.section.list', { sessionId });
      const started = sections.some((section) => section.id === 'guide' && section.owner === owner && section.sessionId === sessionId);
      await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'Building kvman', order: 20, sessionId, content: readGuide() });
      if (!started) await ctx.exec('kvcoder.note.add', { sessionId, key: 'kvbuilder.build.started' });
      return {};
    },
  });
}

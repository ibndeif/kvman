import { z, type Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { connectorName } from './connector.ts';
import { readGuide } from './guide.ts';

// `/video` (plan 16 §16.1): the person starts making videos in a chat. The connector is enabled first, then the guide;
// the note is added the first time only, known by the guide section being there already.

const owner = '@kvman/kvvideo';

export function registerVideoStart(ctx: Ctx): void {
  ctx.registerCommand('kvvideo.video.start', {
    description: "Starts making videos in one chat: gives the chat kvvideo's connector and guide.",
    public: true,
    retries: 0,
    input: z.object({
      sessionId: z.string().min(1).describe('The chat to make videos in.'),
      argument: z.string().describe('The text after /video; the send box sends it as the message.'),
    }),
    output: z.object({}),
    handle: async ({ sessionId }) => {
      await ctx.exec('kvcoder.connector.enable', { sessionId, names: [connectorName] });
      const sections = await ctx.exec('kvcoder.section.list', { sessionId });
      const started = sections.some((section) => section.id === 'guide' && section.owner === owner && section.sessionId === sessionId);
      await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'Making videos', order: 30, sessionId, content: readGuide() });
      if (!started) await ctx.exec('kvcoder.note.add', { sessionId, key: 'kvvideo.video.started' });
      return {};
    },
  });
}

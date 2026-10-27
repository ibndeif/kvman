import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { videoConnector } from './connector.ts';

// kvvideo extends kvcoder (plan 16 §16.1): at each start it registers its `optIn` connector and `/video`, since kvcoder
// clears both at its own start.

export function registerWithKvcoder(ctx: Ctx): void {
  ctx.registerHandler('kernel.started', {
    description: "Registers kvvideo's connector and its slash command with kvcoder.",
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', videoConnector);
      await ctx.exec('kvcoder.slash.register', {
        commands: [{ name: 'video', description: 'kvvideo.slash.video', command: 'kvvideo.video.start', message: 'kvvideo.slash.video.message' }],
      });
    },
  });
}

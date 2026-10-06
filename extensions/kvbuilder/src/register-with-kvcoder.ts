import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { docsConnector } from './connectors/docs.ts';
import { extConnector } from './connectors/ext.ts';
import { kvmanConnector } from './connectors/kvman.ts';
import { presetConnector } from './connectors/preset.ts';
import { previewConnector } from './connectors/preview.ts';

// kvbuilder extends kvcoder (plan 09, §9.1 and §9.4; ADR 0027, 14): at each start it registers its connectors, which
// are `optIn`, and its slash command `/build-kvman`, since kvcoder clears both at its own start. Each connector is in
// its own file.

export function registerWithKvcoder(ctx: Ctx): void {
  ctx.registerHandler('kernel.started', {
    description: "Registers kvbuilder's connectors and its slash command with kvcoder.",
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { connectors: [kvmanConnector, extConnector, presetConnector, previewConnector, docsConnector] });
      await ctx.exec('kvcoder.slash.register', {
        commands: [{ name: 'build-kvman', description: 'kvbuilder.slash.build-kvman', command: 'kvbuilder.build.start', message: 'kvbuilder.slash.build-kvman.message' }],
      });
    },
  });
}

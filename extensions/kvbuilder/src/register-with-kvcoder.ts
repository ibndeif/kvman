import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { docsConnector } from './connectors/docs.ts';
import { extConnector } from './connectors/ext.ts';
import { kvmanConnector } from './connectors/kvman.ts';
import { presetConnector } from './connectors/preset.ts';
import { previewConnector } from './connectors/preview.ts';

// kvbuilder extends kvcoder (plan 09, §9.1 and §9.4): at each start it registers its connectors in one call, since
// kvcoder clears them at its own start. Earlier versions also stored a global section `guide`, which kvcoder keeps until
// its owner removes it (ADR 0023, 1). Each connector is in its own file.

export function registerWithKvcoder(ctx: Ctx): void {
  ctx.registerHandler('kernel.started', {
    description: "Registers kvbuilder's connectors with kvcoder, and removes the guide section that earlier versions stored.",
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { connectors: [kvmanConnector, extConnector, presetConnector, previewConnector, docsConnector] });
      await ctx.exec('kvcoder.section.remove', { id: 'guide', global: true });
    },
  });
}

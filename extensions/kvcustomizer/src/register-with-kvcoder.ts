import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { docsConnector } from './connectors/docs.ts';
import { extConnector } from './connectors/ext.ts';
import { kvmanConnector } from './connectors/kvman.ts';
import { presetConnector } from './connectors/preset.ts';
import { previewConnector } from './connectors/preview.ts';
import { readSection } from './docs/own-docs.ts';

// kvcustomizer extends kvcoder (plan 09, §9.1 and §9.4): at each start it registers its connectors in one call, since
// kvcoder clears them at its own start, and sets its one global section. Each connector is in its own file.

export function registerWithKvcoder(ctx: Ctx): void {
  ctx.registerHandler('kernel.started', {
    description: "Registers kvcustomizer's connectors and its guide section with kvcoder.",
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { connectors: [kvmanConnector, extConnector, presetConnector, previewConnector, docsConnector] });
      await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'kvman extensions', order: 20, global: true, content: readSection() });
    },
  });
}

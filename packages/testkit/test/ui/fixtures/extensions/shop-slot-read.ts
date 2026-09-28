import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E22) whose panel reads a slot prop kit.tray does not declare.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop reading a missing slot prop.' }, (ext) => {
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerPanel('shop.tip', {
    description: 'A tip shown in the kit tray.', slot: 'kit.tray',
    view: { type: 'text', text: '$slot.nope' },
  });
});

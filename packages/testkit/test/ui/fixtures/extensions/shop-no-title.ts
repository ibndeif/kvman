import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E24) whose kit.card node misses the required title prop.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop missing a card title.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Reads the kit items.', types: ['kit.items.list'] });
  ext.requireComponents(['kit.card'], { reason: 'Shows the kit card.' });
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerPage('shop.home', {
    description: 'The shop home page.', route: '/shop', title: 'Shop',
    queries: { items: { query: 'kit.items.list' } },
    view: { type: 'kit.card', onAction: { command: 'shop.ping' } },
  });
});

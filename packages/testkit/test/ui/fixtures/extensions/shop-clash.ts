import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E30) whose page opens on /kit: it needs kit.card (missing when Kit is not enabled) and clashes.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop on the kit route.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Reads the kit items.', types: ['kit.items.list'] });
  ext.requireComponents(['kit.card'], { reason: 'Shows the kit card.' });
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerPage('shop.home', {
    description: 'The shop home page.', route: '/kit', title: 'Shop',
    queries: { items: { query: 'kit.items.list' } },
    view: {
      type: 'kit.card', title: 'Shop', onAction: { command: 'shop.ping' },
      children: [{ type: 'text', text: '$query.items.items.0.name' }],
    },
  });
});

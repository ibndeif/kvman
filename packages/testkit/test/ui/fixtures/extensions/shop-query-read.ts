import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E23) whose page reads a query field kit.items.list does not return.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop reading a missing query field.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Reads the kit items.', types: ['kit.items.list'] });
  ext.requireComponents(['kit.card'], { reason: 'Shows the kit card.' });
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerPage('shop.home', {
    description: 'The shop home page.', route: '/shop', title: 'Shop',
    queries: { items: { query: 'kit.items.list' } },
    view: {
      type: 'kit.card', title: 'Shop', onAction: { command: 'shop.ping' },
      children: [{ type: 'text', text: '$query.items.nope' }],
    },
  });
});

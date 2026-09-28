import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E22) with a toolbar item aimed at kit.tray, which accepts only panels.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop with a toolbar item.' }, (ext) => {
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
      children: [{ type: 'text', text: '$query.items.items.0.name' }],
    },
  });
  ext.registerToolbarItem('shop.upload', {
    description: 'Uploads to the shop.', slot: 'kit.tray', as: 'button', label: 'Upload', action: { command: 'shop.ping' },
  });
});

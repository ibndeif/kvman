import { defineExtension, z } from '@kvman/sdk';

// Shop (@acme/shop, namespace shop), the M2.10 Terms fixture: it calls kit.items.list and requires kit.card, with a
// page using the card, a panel in the kit tray, an action on kit.item, and a renderer for kit.entry.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Reads the kit items.', types: ['kit.items.list'] });
  ext.requireComponents(['kit.card'], { reason: 'Shows the kit card.' });
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerCommand('shop.secret', {
    description: 'A shop internal command.', input: z.object({}), access: 'internal', handle: async () => ({}),
  });
  ext.registerPage('shop.home', {
    description: 'The shop home page.', route: '/shop', title: 'Shop',
    queries: { items: { query: 'kit.items.list' } },
    view: {
      type: 'kit.card', title: 'Shop', onAction: { command: 'shop.ping' },
      children: [{ type: 'text', text: '$query.items.items.0.name' }],
    },
  });
  ext.registerPanel('shop.tip', {
    description: 'A tip shown in the kit tray.', slot: 'kit.tray',
    view: { type: 'text', text: '$slot.itemId' },
  });
  ext.registerAction('shop.inspect', {
    description: 'Inspects a kit item.', entity: 'kit.item', label: '$item.name', command: 'shop.ping',
  });
  ext.registerRenderer('shop.line', {
    description: 'Renders a kit entry.', target: 'kit.entry', view: { type: 'text', text: '$item.text' },
  });
});

import { defineExtension, z } from '@kvman/sdk';

// Shop Lite (also @acme/shop, a separate build): Shop without its page and without requireComponents, only the
// panel, the action, and the renderer.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop, lite.' }, (ext) => {
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
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

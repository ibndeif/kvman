import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E23) whose action reads an item field kit.item does not declare.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop reading a missing item field.' }, (ext) => {
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerAction('shop.inspect', {
    description: 'Inspects a kit item.', entity: 'kit.item', label: '$item.nope', command: 'shop.ping',
  });
});

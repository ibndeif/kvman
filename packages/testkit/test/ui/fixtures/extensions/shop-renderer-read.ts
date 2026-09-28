import { defineExtension, z } from '@kvman/sdk';

// A Shop build (E23) whose renderer reads an item field kit.entry does not declare.
export default defineExtension({ name: '@acme/shop', namespace: 'shop', title: 'Shop', description: 'The UI test shop rendering a missing item field.' }, (ext) => {
  ext.registerCommand('shop.ping', {
    description: 'Pings the shop.', input: z.object({}), handle: async () => ({}),
  });
  ext.registerRenderer('shop.line', {
    description: 'Renders a kit entry.', target: 'kit.entry', view: { type: 'text', text: '$item.nope' },
  });
});

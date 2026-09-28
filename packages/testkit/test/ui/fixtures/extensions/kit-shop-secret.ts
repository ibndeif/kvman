import { defineExtension, z } from '@kvman/sdk';

// A Kit build (E32) whose own page targets Shop's internal shop.secret command.
export default defineExtension({ name: '@acme/kit', namespace: 'kit', title: 'Kit', description: 'The UI test kit targeting an internal type.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Clears the shop cache.', types: ['shop.secret'] });
  ext.registerQuery('kit.items.list', {
    description: 'Lists the kit items.',
    input: z.object({}),
    output: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }),
    handle: async () => ({ items: [] }),
  });
  ext.registerEntity('kit.item', {
    description: 'A kit item.', title: 'Item',
    schema: z.object({ id: z.string(), name: z.string() }),
    display: { title: '$item.name' },
  });
  ext.registerRendererTarget('kit.entry', {
    description: 'A kit entry.', item: z.object({ id: z.string(), text: z.string() }),
  });
  ext.registerSlot('kit.tray', {
    description: 'The kit tray.', accepts: ['panel'], props: z.object({ itemId: z.string() }),
  });
  ext.registerComponent('kit.card', {
    description: 'A kit card.', visibility: 'public',
    props: z.object({ title: z.text(), count: z.number().optional(), onAction: z.action().optional() }),
    children: 'any',
    view: { type: 'text', text: '$props.title' },
  });
  ext.registerPage('kit.home', {
    description: 'The kit home page.', route: '/kit', title: 'Kit',
    view: { type: 'stack', children: [{ type: 'button', label: 'Secret', onClick: { command: 'shop.secret' } }] },
  });
});

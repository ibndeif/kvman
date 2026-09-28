import { defineExtension, z } from '@kvman/sdk';

// Kit v2 (E31): kit.card renames its title prop to heading, breaking Shop's page.
export default defineExtension({ name: '@acme/kit', namespace: 'kit', title: 'Kit', description: 'The UI test kit, second version.' }, (ext) => {
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
    props: z.object({ heading: z.text(), count: z.number().optional(), onAction: z.action().optional() }),
    children: 'any',
    view: { type: 'text', text: '$props.heading' },
  });
  ext.registerPage('kit.home', {
    description: 'The kit home page.', route: '/kit', title: 'Kit',
    view: { type: 'stack', children: [{ type: 'text', text: 'Kit home.' }] },
  });
});

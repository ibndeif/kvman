import { defineExtension, z } from '@kvman/sdk';

// Kit (@acme/kit, namespace kit), the M2.10 Terms fixture: a public card, a private composite, a slot, an entity,
// a renderer target, an all-access query, a page, and an extensions-only command the preset tests target.
export default defineExtension({ name: '@acme/kit', namespace: 'kit', title: 'Kit', description: 'The UI test kit.' }, (ext) => {
  ext.registerCommand('kit.cache.clear', {
    description: 'Clears the kit cache.', input: z.object({}), access: 'extensions', handle: async () => ({}),
  });
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
    view: {
      type: 'stack',
      children: [
        { type: 'text', text: '$props.title' },
        { type: 'button', label: 'Act', onClick: '$props.onAction' },
      ],
    },
  });
  ext.registerComponent('kit.secret', {
    description: 'A private kit composite.', visibility: 'private',
    props: z.object({ title: z.text() }),
    view: { type: 'text', text: '$props.title' },
  });
  ext.registerPage('kit.home', {
    description: 'The kit home page.', route: '/kit', title: 'Kit',
    view: { type: 'stack', children: [{ type: 'text', text: 'Kit home.' }] },
  });
});

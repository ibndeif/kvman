import { z, type Ext } from '@kvman/sdk';

const text = { type: 'text', text: '$t.item.title' } as const;

// Entities with a route of their id, a route that needs another field, and no route, with the pages their routes open.
export function registerHeraldEntities(ext: Ext): void {
  ext.registerPage('herald.item-page', { description: 'One item.', route: '/items/:itemId', title: '$t.item.title', view: text });
  ext.registerPage('herald.pair-page', { description: 'One pair.', route: '/pairs/:group/:pairId', title: '$t.item.title', view: text });
  ext.registerEntity('herald.item', {
    description: 'An item.', title: '$t.item.title', schema: z.object({ id: z.string() }), idField: 'id', display: { title: '$item.id' }, route: '/items/{{ $item.id }}',
  });
  ext.registerEntity('herald.pair', {
    description: 'A pair.', title: '$t.item.title', schema: z.object({ id: z.string(), group: z.string() }), idField: 'id', display: { title: '$item.id' },
    route: '/pairs/{{ $item.group }}/{{ $item.id }}',
  });
  ext.registerEntity('herald.plain', { description: 'A plain record.', title: '$t.item.title', schema: z.object({ id: z.string() }), idField: 'id', display: { title: '$item.id' } });
}

import { defineExtension, z } from '@kvman/sdk';
import { emit, emitInput } from './emit.ts';

const empty = z.object({});

// A second extension with `ui`: its own notices, button targets for Herald's calls, and an entity with a route.
export default defineExtension({ name: '@acme/crier', namespace: 'crier', title: 'Crier', description: 'A second sender for the notification tests.' }, (ext) => {
  ext.requestCapability('ui', { reason: 'Shows notices.' });
  ext.requestIsolation('shared', { reason: 'Runs in the shared host for the notification tests.' });
  ext.registerTranslations({ default: 'en', catalogs: { en: { thing: { title: 'Thing' } } } });
  ext.registerCommand('crier.emit', { description: 'Sends the notices given.', input: emitInput, handle: emit });
  ext.registerCommand('crier.shout', { description: 'A button target for everyone.', input: empty, handle: async () => ({}) });
  ext.registerCommand('crier.approve', { description: 'A button target for people.', input: empty, access: 'user', handle: async () => ({}) });
  ext.registerPage('crier.thing-page', { description: 'One thing.', route: '/things/:thingId', title: '$t.thing.title', view: { type: 'text', text: '$t.thing.title' } });
  ext.registerEntity('crier.thing', {
    description: 'A thing.', title: '$t.thing.title', schema: z.object({ id: z.string() }), idField: 'id', display: { title: '$item.id' }, route: '/things/{{ $item.id }}',
  });
});

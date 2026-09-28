import { defineExtension, z } from '@kvman/sdk';

export default defineExtension({
  name: '@acme/lingo-mute',
  namespace: 'mute',
  title: 'Lingo Mute',
  description: 'Exercises translation calls without registered catalogs.',
}, (ext) => {
  ext.registerCommand('mute.say', {
    description: 'Attempts to format a message without a catalog.',
    input: z.object({ key: z.string(), params: z.record(z.string(), z.json()).optional() }),
    access: 'all',
    handle: async ({ key, params }, ctx) => ({ text: ctx.i18n.t(key, params) }),
  });
});

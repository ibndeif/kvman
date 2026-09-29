import { defineExtension, z } from '@kvman/sdk';

// A literal summary and a placeholder query description: both warn without failing (M2.13-E23).
export default defineExtension({
  name: '@acme/literal',
  namespace: 'literal',
  title: '$t.title',
  summary: 'Plain words',
  description: 'Uses literal text and a placeholder description.',
}, (ext) => {
  ext.registerQuery('literal.status.get', {
    description: 'TODO',
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    handle: async () => ({ ok: true }),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Literal' },
      ar: { title: 'حرفي' },
    },
  });
});

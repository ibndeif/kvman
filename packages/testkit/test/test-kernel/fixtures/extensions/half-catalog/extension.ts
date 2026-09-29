import { defineExtension, z } from '@kvman/sdk';

// Its ar catalog lacks the title key on purpose, so createTestKernel fails (M2.13-E22).
export default defineExtension({
  name: '@acme/half-catalog',
  namespace: 'half',
  title: '$t.title',
  summary: 'Ships a partial catalog.',
  description: 'Uses a title key its Arabic catalog lacks.',
}, (ext) => {
  ext.registerCommand('half.hello', {
    description: 'Answers that it runs.',
    input: z.object({}),
    handle: async () => ({}),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Half catalog' },
      ar: {},
    },
  });
});

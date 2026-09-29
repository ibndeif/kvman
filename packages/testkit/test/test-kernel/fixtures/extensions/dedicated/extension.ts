import { defineExtension, z } from '@kvman/sdk';

// Requests dedicated isolation, so each mode grants what it grants (M2.13-E5).
export default defineExtension({
  name: '@acme/dedicated',
  namespace: 'dedicated',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Runs dedicated where the grant allows it.',
}, (ext) => {
  ext.requestIsolation('dedicated', { reason: 'Runs its parser apart from other extensions.' });
  ext.registerCommand('dedicated.ping', {
    description: 'Answers that it runs.',
    input: z.object({}),
    handle: async () => ({}),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Dedicated', summary: 'Runs apart from other extensions.' },
      ar: { title: 'مخصص', summary: 'يعمل بمعزل عن الإضافات الأخرى.' },
    },
  });
});

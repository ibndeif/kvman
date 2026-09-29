import { defineExtension, z } from '@kvman/sdk';

// Other has no process capability, so its spawn never runs, faked or not (M2.13).
export default defineExtension({
  name: '@acme/other',
  namespace: 'other',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Fails and spawns for the M2.13 scenarios.',
}, (ext) => {
  ext.registerError('other/BROKEN', { description: 'Fails when the test relays to it.', title: 'Other broke on purpose' });
  ext.registerCommand('other.fail', {
    description: 'Fails with its registered code.',
    input: z.object({}),
    handle: async (_input, ctx) => {
      throw ctx.problem('other/BROKEN');
    },
  });
  ext.registerCommand('other.spawn', {
    description: 'Spawns a process without the process capability.',
    input: z.object({ command: z.string() }),
    handle: async ({ command }, ctx) => ctx.process.spawn({ command }),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Other', summary: 'The other extension under test.' },
      ar: { title: 'أخرى', summary: 'الإضافة الأخرى قيد الاختبار.' },
    },
  });
});

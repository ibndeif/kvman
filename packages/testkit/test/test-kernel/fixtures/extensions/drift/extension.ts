import { defineExtension, z } from '@kvman/sdk';

let runs = 0;

// Registers a different command on every run, so recording fails as nondeterministic (M2.13-E3).
export default defineExtension({
  name: '@acme/drift',
  namespace: 'drift',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Registers a different command on every setup run.',
}, (ext) => {
  runs += 1;
  ext.registerCommand(`drift.run-${runs}`, {
    description: 'A command that drifts between setup runs.',
    input: z.object({}),
    handle: async () => ({}),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Drift', summary: 'Drifts between setup runs.' },
      ar: { title: 'انحراف', summary: 'يتغير بين تشغيلات الإعداد.' },
    },
  });
});

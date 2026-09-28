import { defineExtension } from '@kvman/sdk';

// Twin registers provider fake too, so enabling it next to the fake provider conflicts.
export default defineExtension({
  name: '@acme/twin',
  namespace: 'twin',
  title: 'Twin',
  description: 'Registers provider fake too.',
}, (ext) => {
  ext.registerProvider('fake', {
    title: 'Twin Fake',
    description: 'A trivial provider sharing the fake id.',
    auth: 'none',
    status: async () => ({ configured: true }),
    complete: async () => ({
      content: 'twin',
      usage: { input: 1, output: 1 },
      model: { provider: 'fake', id: 'twin-model' },
      stopReason: 'end',
    }),
  });
  ext.registerModel('twin-model', {
    provider: 'fake',
    title: 'Twin Model',
    description: 'A model on the shared fake provider.',
    contextWindow: 8000,
    maxOutput: 1000,
    capabilities: { tools: false, vision: false, thinking: [] },
  });
});

import { defineExtension } from '@kvman/sdk';

// Slow's complete waits until its signal aborts, then throws.
export default defineExtension({
  name: '@acme/slow',
  namespace: 'slow',
  title: 'Slow',
  description: 'A provider whose complete waits for its abort.',
}, (ext) => {
  ext.registerProvider('slow', {
    title: 'Slow',
    description: 'Waits until its signal aborts.',
    auth: 'none',
    status: async () => ({ configured: true }),
    complete: async (_request, ctx) => {
      if (!ctx.signal.aborted) {
        await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve(undefined), { once: true }));
      }
      throw new Error('slow aborted');
    },
  });
  ext.registerModel('slow-model', {
    provider: 'slow',
    title: 'Slow Model',
    description: 'A model that never answers.',
    contextWindow: 8000,
    maxOutput: 1000,
    capabilities: { tools: false, vision: false, thinking: [] },
  });
});

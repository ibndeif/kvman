import { defineExtension, z } from '@kvman/sdk';

// Requires only a kernel type, which every workspace provides.
export default defineExtension({ name: '@acme/watcher', namespace: 'watcher', title: 'Watcher', description: 'Watches the kernel.' }, (ext) => {
  ext.requireTypes(['kernel.health.get'], { reason: 'Shows whether the kernel runs.' });
  ext.registerCommand('watcher.look', { description: 'Looks at the kernel.', input: z.object({}), handle: async () => ({}) });
});

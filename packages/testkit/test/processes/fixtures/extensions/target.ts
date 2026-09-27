import { defineExtension, z } from '@kvman/sdk';

// Another extension's types, which a process reaches only with its actor's grants (ADR 0140).
export default defineExtension({ name: '@acme/target', namespace: 'target', title: 'Target', description: 'Answers pings.' }, (ext) => {
  ext.registerCommand('target.ping', { description: 'Echoes its text.', input: z.object({ text: z.string() }), handle: async ({ text }) => ({ text }) });
  ext.registerCommand('target.serve', { description: 'Only extensions and their processes may call it.', access: 'extensions', input: z.object({}), handle: async () => ({}) });
  ext.registerCommand('target.approve', { description: 'Only a person may call it.', access: 'user', input: z.object({}), handle: async () => ({}) });
});

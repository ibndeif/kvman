import type { Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvcoder';
import { readDoc } from './docs/register-docs.ts';

// kvcustomizer extends kvcoder (plan 09, §9.1 and §9.4): at each start it registers its four connectors, which kvcoder clears
// at its own start, and sets its one global section.

const connectors = [
  {
    name: 'ext',
    description: 'Create, list, check, and test kvman extension projects in the workspace. Use it for any work on an extension, and run check, then test, after changing one.',
    commands: [
      { name: 'new', command: 'kvcustomizer.ext.new', examples: [{ description: 'Scaffold a notes extension', input: { name: 'notes', namespace: 'notes', folder: 'notes' } }, { description: 'Scaffold one with a Vue component', input: { name: 'cards', namespace: 'cards', folder: 'cards', web: true } }] },
      { name: 'list', command: 'kvcustomizer.ext.list' },
      { name: 'check', command: 'kvcustomizer.ext.check', examples: [{ description: 'Check the notes project', input: { folder: 'notes' } }] },
      { name: 'test', command: 'kvcustomizer.ext.test', examples: [{ description: 'Test the notes project', input: { folder: 'notes' } }] },
    ],
  },
  {
    name: 'preset',
    description: 'Write and check kvman presets. Use it to create a preset file, and to check it before running it.',
    commands: [
      { name: 'new', command: 'kvcustomizer.preset.new', examples: [{ description: 'Write a preset for a notes app', input: { name: 'notes-app', file: 'notes-app.json' } }] },
      { name: 'check', command: 'kvcustomizer.preset.check', examples: [{ description: 'Check that preset', input: { file: 'notes-app.json' } }] },
    ],
  },
  {
    name: 'preview',
    description: 'Run extension projects in a separate kvman with a temporary home. Use it to show the person a project working, and stop it when you are done.',
    commands: [
      { name: 'start', command: 'kvcustomizer.preview.start', examples: [{ description: 'Preview the notes project', input: { extensions: ['notes'] } }] },
      { name: 'stop', command: 'kvcustomizer.preview.stop' },
      { name: 'status', command: 'kvcustomizer.preview.status' },
    ],
  },
  {
    name: 'docs',
    description: 'Read the kvman development guides. Use it before you write an extension, a preset, a view, or a component.',
    commands: [{ name: 'get', command: 'kvcustomizer.docs.get', examples: [{ description: 'Read the SDK guide', input: { topic: 'sdk' } }] }],
  },
];

export function registerWithKvcoder(ctx: Ctx): void {
  ctx.registerHandler('kernel.started', {
    description: "Registers kvcustomizer's connectors and its guide section with kvcoder.",
    handle: async () => {
      for (const connector of connectors) await ctx.exec('kvcoder.connector.register', connector);
      await ctx.exec('kvcoder.section.set', { id: 'guide', title: 'kvman extensions', order: 20, global: true, content: readDoc('section') });
    },
  });
}

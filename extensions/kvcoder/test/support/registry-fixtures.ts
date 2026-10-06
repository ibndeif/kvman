import type { FixtureExtension } from './kvcoder-kernel.ts';

// Two small extensions that register with kvcoder from their own `kernel.started` handlers, the way a real extension
// does (plan 08 §8.4): `@test/slash` adds a slash command, and `@test/optin` an `optIn` connector. Loading them only in
// the tests that need them keeps the other tests' connector and slash lists unchanged.

export const slashEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerCommand('slash.run', { description: 'Runs a fixture slash command.', input: z.object({ sessionId: z.string(), argument: z.string() }), output: z.object({}), public: true, handle: () => ({}) });
  ctx.registerHandler('kernel.started', {
    description: 'Registers the fixture slash command with kvcoder.',
    handle: async () => {
      await ctx.exec('kvcoder.slash.register', { commands: [{ name: 'from-fixture', description: 'slash.fixture', command: 'slash.run' }] });
    },
  });
};
`;

export const slashFixture: FixtureExtension = { name: '@test/slash', namespace: 'slash', entry: slashEntry, dependencies: { '@kvman/kvcoder': '^0.1.0' } };

export const optInEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  const items = () => ctx.store.collection('optin-items', z.object({ text: z.string() }));
  ctx.registerCommand('optin.add', { description: 'Adds an opt-in item.', input: z.object({ text: z.string() }), output: z.object({ text: z.string() }), public: true,
    handle: async ({ text }) => { await items().insert({ text }); return { text }; } });
  ctx.registerHandler('kernel.started', {
    description: 'Registers the opt-in connector with kvcoder.',
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { name: 'optin', description: 'Opt-in items.', optIn: true, commands: [{ name: 'add', command: 'optin.add' }] });
    },
  });
};
`;

export const optInFixture: FixtureExtension = { name: '@test/optin', namespace: 'optin', entry: optInEntry, dependencies: { '@kvman/kvcoder': '^0.1.0' } };

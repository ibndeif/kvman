import { z, type Ext } from '@kvman/sdk';
import { codeOfCall } from './outcomes.ts';

const empty = z.object({});

// Desk's config (scope both, with a secret field) and the handlers that read and write ctx.config and ctx.secrets.
export function registerDeskSettings(ext: Ext): void {
  ext.registerConfig({
    scope: 'both',
    schema: z.object({
      model: z.string().default('small').describe('The model the desk uses.'),
      limit: z.number().default(10).describe('How many notes a page shows.'),
      apiKey: z.string().describe('The API key of the desk service.').meta({ secret: true }),
    }),
  });
  ext.registerCommand('desk.settings', {
    description: 'Reads its config and its API key.', input: empty,
    handle: async (_input, ctx) => ({ config: await ctx.config.get(), apiKey: (await ctx.secrets.get('apiKey')) ?? null }),
  });
  ext.registerCommand('desk.remember', {
    description: 'Writes a workspace limit and reads the result.', input: z.object({ limit: z.number(), fail: z.boolean().default(false) }),
    handle: async ({ limit, fail }, ctx) => {
      ctx.config.set('workspace', { limit });
      const merged = await ctx.config.get();
      if (fail) throw ctx.problem('desk/FAILED');
      return merged;
    },
  });
  ext.registerCommand('desk.config.bad', {
    description: 'Writes a limit that is not a number.', input: empty,
    handle: async (_input, ctx) => {
      ctx.config.set('workspace', { limit: 'many' });
      return {};
    },
  });
  ext.registerCommand('desk.config.unscoped', {
    description: 'Tries a workspace value without a workspace.', input: empty, scope: 'global',
    handle: async (_input, ctx) => ({ code: await codeOfCall(() => ctx.config.set('workspace', { limit: 1 })) }),
  });
  ext.registerCommand('desk.secret.keep', {
    description: 'Sets a token and reads it back.', input: z.object({ value: z.string() }),
    handle: async ({ value }, ctx) => {
      ctx.secrets.set('oauth.token', value);
      return { seen: (await ctx.secrets.get('oauth.token')) ?? null };
    },
  });
  ext.registerCommand('desk.secret.drop', {
    description: 'Clears the token and reads it back.', input: empty,
    handle: async (_input, ctx) => {
      ctx.secrets.set('oauth.token', null);
      return { seen: (await ctx.secrets.get('oauth.token')) ?? null };
    },
  });
  ext.registerCommand('desk.secret.badname', {
    description: 'Sets a secret with a name outside the grammar.', input: empty,
    handle: async (_input, ctx) => ({ code: await codeOfCall(() => ctx.secrets.set('bad name', 'x')) }),
  });
  ext.registerQuery('desk.secret.peek', {
    description: 'Reads the token, and tries to set one from a query.', input: empty, output: z.object({ value: z.string().nullable(), set: z.string() }),
    handle: async (_input, ctx) => ({ value: (await ctx.secrets.get('oauth.token')) ?? null, set: await codeOfCall(() => ctx.secrets.set('x', 'y')) }),
  });
}

import { defineExtension, z } from '@kvman/sdk';
import { emit, emitInput } from './emit.ts';
import { registerHeraldEntities } from './herald-entities.ts';
import { outcomeOf } from './outcomes.ts';

const empty = z.object({});

// The notification tests' main fixture (M2.12 Terms): sends ctx.ui notices as given, relays, fails for dead letters,
// and has commands of every access for buttons.
export default defineExtension({ name: '@acme/herald', namespace: 'herald', title: 'Herald', description: 'Sends notices for the notification tests.' }, (ext) => {
  ext.requestCapability('ui', { reason: 'Shows notices.' });
  ext.requestCapability('calls', { reason: 'Offers Crier buttons.', types: ['crier.shout', 'crier.approve'] });
  ext.requestIsolation('shared', { reason: 'Runs in the shared host for the notification tests.' });
  ext.registerTranslations({ default: 'en', catalogs: { en: { item: { title: 'Item' } } } });
  ext.registerCommand('herald.emit', { description: 'Sends the notices given.', input: emitInput, handle: emit });
  ext.registerCommand('herald.emit-global', { description: 'Sends the notices given without a workspace.', input: emitInput, scope: 'global', handle: emit });
  ext.registerCommand('herald.relay', {
    description: 'Sends herald.emit with the notices given.', input: z.object({ sends: emitInput.shape.sends }),
    handle: async ({ sends }, ctx) => {
      ctx.send('herald.emit', { sends });
      return {};
    },
  });
  ext.registerCommand('herald.replied', {
    description: 'Records a continuation.', input: z.json(), access: 'internal',
    handle: async (payload, ctx) => {
      const replies = await ctx.store.kv.get('replies');
      ctx.store.kv.set('replies', [...(Array.isArray(replies) ? replies : []), payload]);
      return {};
    },
  });
  ext.registerQuery('herald.state.get', {
    description: 'The note, the continuations, and whether it is healed.', input: empty,
    output: z.object({ note: z.json().nullable(), replies: z.array(z.json()), healed: z.json() }),
    handle: async (_input, ctx) => {
      const stored = await ctx.store.kv.get('replies');
      return { note: (await ctx.store.kv.get('note')) ?? null, replies: Array.isArray(stored) ? stored : [], healed: (await ctx.store.kv.get('healed')) ?? false };
    },
  });
  ext.registerCommand('herald.fail', {
    description: 'Fails until it is healed.', input: empty, maxAttempts: 2,
    handle: async (_input, ctx) => {
      if ((await ctx.store.kv.get('healed')) !== true) throw new Error('not healed yet');
      return { ran: true };
    },
  });
  ext.registerCommand('herald.fail-global', {
    description: 'Fails without a workspace.', input: empty, maxAttempts: 2, scope: 'global',
    handle: async () => {
      throw new Error('always fails');
    },
  });
  ext.registerCommand('herald.emit-then-fail', {
    description: 'Sends the notices given, then fails retryably until it is healed.', input: emitInput, maxAttempts: 2,
    handle: async (input, ctx) => {
      await emit(input, ctx);
      if ((await ctx.store.kv.get('healed')) !== true) throw new Error('not healed yet');
      return {};
    },
  });
  ext.registerCommand('herald.heal', {
    description: 'Lets herald.fail succeed.', input: empty,
    handle: async (_input, ctx) => {
      ctx.store.kv.set('healed', true);
      return {};
    },
  });
  ext.registerCommand('herald.fail-later', {
    description: 'Sends herald.fail with a continuation.', input: empty,
    handle: async (_input, ctx) => {
      ctx.send('herald.fail', {}, { onReply: { type: 'herald.replied' } });
      return {};
    },
  });
  ext.registerCommand('herald.call', {
    description: 'Calls a kernel type and reports its result or problem.', input: z.object({ type: z.string(), payload: z.json(), kind: z.enum(['command', 'query']) }),
    handle: async ({ type, payload, kind }, ctx) => outcomeOf(() => (kind === 'command' ? ctx.command(type, payload) : ctx.query(type, payload))),
  });
  ext.registerCommand('herald.redo', { description: 'A button target for everyone.', input: empty, handle: async () => ({}) });
  ext.registerCommand('herald.answer', { description: 'A button target for people.', input: empty, access: 'user', handle: async () => ({}) });
  ext.registerCommand('herald.tick', { description: 'An internal command.', input: empty, access: 'internal', handle: async () => ({}) });
  ext.registerCommand('herald.api', { description: 'A command for extensions.', input: empty, access: 'extensions', handle: async () => ({}) });
  registerHeraldEntities(ext);
});

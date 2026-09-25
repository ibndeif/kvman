import { randomUUID } from 'node:crypto';
import { defineExtension, z } from '@kvman/sdk';

// Drawn when a host thread loads the module, so a restarted kernel's retry streams under another token (ADR 0101).
const workerToken = randomUUID();

const account = z.object({ account: z.string(), n: z.number().int() });
const byId = z.object({ id: z.string() });

// The fault harness's workload (M1.9): every effect a crash must neither lose nor repeat, in lanes.
export default defineExtension({ name: '@acme/ledger', namespace: 'ledger', title: 'Ledger', description: 'Postings for the fault harness.' }, (ext) => {
  const postings = ext.registerLog('postings:*', { description: 'Each account\'s postings, in commit order.', entry: account.extend({ messageId: z.string() }) });
  ext.registerEvent('ledger.posted', { description: 'A posting was committed.', payload: account });
  ext.registerEvent('ledger.progress.streamed', { description: 'Progress as it streams.', delivery: 'live', chunk: 'text' });

  ext.registerCommand('ledger.post', {
    description: 'Posts to an account.', input: account, lane: 'account:{{ $payload.account }}',
    handle: async ({ account: name, n }, ctx) => {
      const balance = ((await ctx.store.kv.get<number>(`balance:${name}`)) ?? 0) + 1;
      ctx.store.kv.set(`balance:${name}`, balance);
      await ctx.store.log(postings, name).append({ account: name, n, messageId: ctx.message.id });
      ctx.send('ledger.audit.record', { account: name, n });
      ctx.publish('ledger.posted', { account: name, n });
      return { balance };
    },
  });
  ext.registerCommand('ledger.audit.record', { description: 'Records a posting for audit.', input: account, access: 'internal', handle: async () => ({}) });
  ext.registerCommand('ledger.transfer', {
    description: 'Posts to account t and waits for it.', input: byId,
    handle: async (_input, ctx) => ({ posted: await ctx.command('ledger.post', { account: 't', n: 1 }) }),
  });
  ext.registerCommand('ledger.charge', {
    description: 'Charges once: its step is not retry-safe.', input: byId,
    handle: async ({ id }, ctx) => ({ charged: await ctx.step('charge', async () => id) }),
  });
  ext.registerCommand('ledger.refund', {
    description: 'Refunds: its step is retry-safe.', input: byId,
    handle: async ({ id }, ctx) => ({ refunded: await ctx.step('refund', async () => id, { retrySafe: true }) }),
  });
  ext.registerCommand('ledger.hold', { description: 'Holds until released.', input: byId, handle: async (_input, ctx) => ctx.defer() });
  ext.registerCommand('ledger.release', {
    description: 'Releases a hold.', input: z.object({ holdId: z.string() }),
    handle: async ({ holdId }, ctx) => {
      ctx.reply(holdId, { released: true });
      return {};
    },
  });
  ext.registerCommand('ledger.stream', {
    description: 'Streams its worker token, then returns it.', input: byId,
    handle: async ({ id }, ctx) => {
      ctx.live('ledger.progress.streamed', id, { text: workerToken });
      return { token: workerToken };
    },
  });
  ext.registerCommand('ledger.fragile', { description: 'Does nothing, in at most two attempts.', input: byId, maxAttempts: 2, handle: async () => ({}) });
});

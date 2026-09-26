import { defineExtension, z } from '@kvman/sdk';
import { registerDeskSettings } from './desk-settings.ts';
import { aborted, outcomeOf } from './outcomes.ts';

const empty = z.object({});
const laned = z.object({ lane: z.string() });

// The workspace tests' main fixture: lanes held and released, a running handler, deferred commands with onAbort,
// config with a secret field, and calls to kernel types.
export default defineExtension({ name: '@acme/desk', namespace: 'desk', title: 'Desk', description: 'A desk for the workspace tests.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Waits at the gate.', types: ['gate.*'] });
  ext.registerError('desk/FAILED', { description: 'Failed on request.', title: 'The desk failed' });
  ext.registerCommand('desk.note', {
    description: 'Writes a note in its lane.', input: laned, lane: 'desk:{{ $payload.lane }}',
    handle: async ({ lane }, ctx) => {
      ctx.store.kv.set(`note:${lane}`, ctx.message.id);
      return {};
    },
  });
  ext.registerCommand('desk.hold', {
    description: 'Holds its lane until the gate opens.', input: laned, lane: 'desk:{{ $payload.lane }}',
    handle: async (_input, ctx) => {
      await ctx.command('gate.wait', {});
      return {};
    },
  });
  ext.registerCommand('desk.hang', {
    description: 'Runs until it is aborted.', input: empty,
    handle: async (_input, ctx) => {
      await aborted(ctx);
      return {};
    },
  });
  ext.registerCommand('desk.ask', { description: 'Waits for an answer.', input: empty, handle: async (_input, ctx) => ctx.defer({ onAbort: 'desk.expire' }) });
  ext.registerCommand('desk.expire', {
    description: 'Records an unanswered question.', input: z.object({ commandId: z.string(), reason: z.string() }), access: 'internal',
    handle: async ({ commandId, reason }, ctx) => {
      ctx.store.global.kv.set(`expired:${commandId}`, { reason });
      return {};
    },
  });
  ext.registerCommand('desk.ask.stuck', { description: 'Waits for an answer; its abort never ends.', input: empty, handle: async (_input, ctx) => ctx.defer({ onAbort: 'desk.expire.stuck' }) });
  ext.registerCommand('desk.expire.stuck', {
    description: 'Runs until it is aborted.', input: z.object({ commandId: z.string(), reason: z.string() }), access: 'internal',
    handle: async (_input, ctx) => {
      await aborted(ctx);
      return {};
    },
  });
  ext.registerCommand('desk.global.ping', { description: 'Answers without a workspace.', input: empty, scope: 'global', handle: async () => ({ pong: true }) });
  ext.registerCommand('desk.call', {
    description: 'Calls a command and reports its result or problem.', input: z.object({ type: z.string(), payload: z.json() }),
    handle: async ({ type, payload }, ctx) => outcomeOf(() => ctx.command(type, payload)),
  });
  ext.registerCommand('desk.read', {
    description: 'Runs a query and reports its result or problem.', input: z.object({ type: z.string(), payload: z.json() }),
    handle: async ({ type, payload }, ctx) => outcomeOf(() => ctx.query(type, payload)),
  });
  registerDeskSettings(ext);
});

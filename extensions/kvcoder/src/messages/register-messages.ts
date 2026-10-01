import { z, type Ctx } from '@kvman/sdk';
import { fromSessionHandler } from '../registry/session-points.ts';
import { findSession, ownSession, userOnly } from '../sessions/session-lookup.ts';
import { messageSchema, messageView, queuedView } from '../sessions/session-view.ts';
import { records, txRecords } from '../store/collections.ts';
import { appendMessage } from '../turns/history.ts';
import { newestMessages } from '../turns/message-blocks.ts';
import { receiveMessage } from './receive-message.ts';

// Messages (plan 08 §8.6): the person's `message.send`, extensions' `message.inject`, display-only notes, and the list.

const sendSchema = z.object({ sessionId: z.string(), text: z.string().min(1), fileIds: z.array(z.string()).exactOptional() });

export function registerMessages(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.message.send', {
    description: "Sends the person's message: it starts a turn, steers the running one, or answers a waiting one.",
    input: sendSchema,
    output: z.object({}),
    public: true,
    retries: 0,
    handle: async ({ sessionId, text, fileIds }) => {
      userOnly(ctx, 'kvcoder.message.send');
      await receiveMessage(ctx, await ownSession(ctx, sessionId), { text, fileIds: fileIds ?? [], source: { kind: 'user' }, mayStart: true });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.message.inject', {
    description: "Adds an extension's message to a session, as the person's message would be, marked as the extension's.",
    input: sendSchema,
    output: z.object({}),
    public: true,
    retries: 0,
    handle: async ({ sessionId, text, fileIds }) => {
      const caller = ctx.job.caller;
      const source = caller.kind === 'extension' ? { kind: 'extension' as const, name: caller.name } : { kind: 'user' as const };
      const session = await ownSession(ctx, sessionId);
      await receiveMessage(ctx, session, { text, fileIds: fileIds ?? [], source, mayStart: !(await fromSessionHandler(ctx)) });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.note.add', {
    description: 'Adds a display-only note to a session; it never reaches the model and never starts a turn.',
    input: z.object({ sessionId: z.string(), key: z.string().min(1), params: z.record(z.string(), z.json()).exactOptional() }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, key, params }) => {
      const session = await ownSession(ctx, sessionId);
      await ctx.store.transaction((tx) => appendMessage(txRecords(tx), session, { kind: 'note', content: { key, ...(params === undefined ? {} : { params }) } }));
      return {};
    },
  });
  ctx.registerQuery('kvcoder.message.list', {
    description: "Lists a session's newest messages in order, the count of older ones, and the messages waiting for the step.",
    input: z.object({ sessionId: z.string(), limit: z.number().int().positive().max(1000) }),
    output: z.object({ messages: z.array(messageSchema), omitted: z.number().int() }),
    public: true,
    handle: async ({ sessionId, limit }) => {
      const session = await findSession(ctx, sessionId);
      const store = records(ctx.store);
      const newest = await newestMessages(ctx, sessionId, limit, session.nextSeq);
      const queued = await store.queued.find({ sessionId }, { limit: 1000 });
      return { messages: [...newest.map(messageView), ...queued.map(queuedView)], omitted: (await store.messages.count({ sessionId })) - newest.length };
    },
  });
}

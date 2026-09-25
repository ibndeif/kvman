import { z, type Ext } from '@kvman/sdk';
import { codeOfCall } from './notes-state.ts';

export function registerDeferred(ext: Ext): void {
  ext.registerCommand('notes.ask', {
    description: 'Asks a question and replies later.', input: z.object({ id: z.string() }), lane: 'question:{{ $payload.id }}',
    handle: async (_input, ctx) => {
      ctx.store.collection('questions').put({ id: ctx.message.id, status: 'open' });
      return ctx.defer({ onAbort: 'notes.question.expire' });
    },
  });
  ext.registerCommand('notes.question.expire', {
    description: 'Closes an unanswered question.', input: z.object({ commandId: z.string(), reason: z.string() }), access: 'internal',
    handle: async ({ commandId, reason }, ctx) => {
      ctx.store.kv.set(`expired:${commandId}`, { reason, source: ctx.message.source });
      return {};
    },
  });
  ext.registerCommand('notes.question.answer', {
    description: 'Answers a question.', input: z.object({ askId: z.string(), answer: z.string() }), access: 'user',
    handle: async ({ askId, answer }, ctx) => {
      ctx.store.kv.set(`answered:${ctx.message.id}`, answer);
      ctx.reply(askId, { answer });
      return {};
    },
  });
  ext.registerCommand('notes.reply.other', {
    description: 'Replies to any command.', input: z.object({ commandId: z.string() }),
    handle: async ({ commandId }, ctx) => {
      ctx.store.kv.set(`replied:${ctx.message.id}`, commandId);
      ctx.reply(commandId, { x: 1 });
      return {};
    },
  });
  ext.registerCommand('notes.start', {
    description: 'Asks with a continuation.', input: z.object({ id: z.string() }),
    handle: async ({ id }, ctx) => {
      ctx.send('notes.ask', { id }, { onReply: { type: 'notes.answer.record' } });
      return {};
    },
  });
  ext.registerCommand('notes.answer.record', {
    description: 'Records an answer.', input: z.object({ reply: z.object({ ok: z.boolean() }).loose() }), access: 'internal',
    handle: async (_input, ctx) => {
      ctx.store.kv.set(`recorded:${ctx.message.causationId ?? ''}`, ctx.message.payload);
      return {};
    },
  });
  ext.registerCommand('notes.defer.checks', {
    description: 'Defers with wrong onAbort commands.', input: z.object({}),
    handle: async (_input, ctx) => ({
      codes: [await codeOfCall(() => ctx.defer({ onAbort: 'notes.add' })), await codeOfCall(() => ctx.defer({ onAbort: 'counter.reset' }))],
    }),
  });
  ext.subscribe('notes.added', {
    description: 'Tries to defer an event, and records the payload default.',
    handle: async (payload, ctx) => {
      const { id, source } = z.object({ id: z.string(), source: z.string() }).parse(payload);
      ctx.store.kv.set(`added-source:${id}`, source);
      ctx.store.kv.set(`subscription-defer:${id}`, await codeOfCall(() => ctx.defer()));
    },
  });
}

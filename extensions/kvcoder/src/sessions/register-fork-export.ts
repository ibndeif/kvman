import { z, type Ctx, type Json } from '@kvman/sdk';
import { firePoint } from '../registry/session-points.ts';
import { records, txRecords } from '../store/collections.ts';
import { messagesFrom } from '../turns/message-blocks.ts';
import { newSession } from './new-session.ts';
import { ownSession } from './session-lookup.ts';
import { messageView, sessionSchema, sessionView, turnView } from './session-view.ts';

// Fork and export (plan 08 §8.6, ADR 0009, 103).

async function sessionExport(ctx: Ctx, sessionId: string): Promise<Record<string, Json>> {
  const store = records(ctx.store);
  const session = await store.sessions.get(sessionId);
  if (session === undefined) return {};
  const turns = (await store.turns.find({ sessionId }, { limit: 1000 })).map(turnView);
  const messages = (await messagesFrom(ctx, sessionId, 0, session.nextSeq)).map(messageView);
  return { session: sessionView(session), turns, messages };
}

/** An export file's name: the title with characters files can't hold replaced, or the id for a translated title. */
export function exportName(title: string | { key: string }, sessionId: string): string {
  if (typeof title !== 'string' || title === '') return `${sessionId}.json`;
  return `${title.replace(/[/\\:*?"<>|]/g, '-').slice(0, 100)}.json`;
}

export function registerForkExport(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.session.fork', {
    description: "Copies a session's messages, and its summary, through a seq into a new session.",
    input: z.object({ sessionId: z.string(), throughSeq: z.number().int().nonnegative().exactOptional() }),
    output: sessionSchema,
    public: true,
    handle: async ({ sessionId, throughSeq }) => {
      const source = await ownSession(ctx, sessionId);
      const last = throughSeq ?? source.nextSeq - 1;
      const copied = await messagesFrom(ctx, sessionId, 0, Math.min(last + 1, source.nextSeq));
      const fork = await newSession(ctx, source.title === '' ? undefined : source.title);
      const updated = await ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        for (const { id: _id, ...message } of copied) store.messages.insert({ ...message, sessionId: fork.id, turnId: null });
        return store.sessions.update(fork.id, { model: source.model, thinking: source.thinking, nextSeq: (copied.at(-1)?.seq ?? -1) + 1 });
      });
      await firePoint(ctx, 'kvcoder.session.forked', { fromSessionId: sessionId, toSessionId: fork.id, throughSeq: last });
      return sessionView(updated);
    },
  });
  ctx.registerCommand('kvcoder.session.export', {
    description: 'Writes a session, its turns and messages, and its subagent sessions to a JSON file.',
    input: z.object({ sessionId: z.string() }),
    output: z.object({ fileId: z.string() }),
    public: true,
    handle: async ({ sessionId }) => {
      const session = await ownSession(ctx, sessionId);
      const children = await records(ctx.store).sessions.find({ parentId: sessionId }, { limit: 1000 });
      const artifacts = (await records(ctx.store).artifacts.find({ sessionId }, { limit: 1000 }))
        .sort((first, second) => first.createdAt.localeCompare(second.createdAt) || first.artifactId.localeCompare(second.artifactId))
        .map((doc) => ({ id: doc.artifactId, title: doc.title, format: doc.format, version: doc.version, content: doc.content, createdAt: doc.createdAt, updatedAt: doc.updatedAt }));
      const data = { ...(await sessionExport(ctx, sessionId)), artifacts, subagents: await Promise.all(children.map((child) => sessionExport(ctx, child.id))) };
      const file = await ctx.files.write(exportName(session.title, sessionId), JSON.stringify(data, null, 2), 'application/json');
      return { fileId: file.id };
    },
  });
}

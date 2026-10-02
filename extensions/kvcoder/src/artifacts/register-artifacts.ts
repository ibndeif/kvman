import { z, type Ctx } from '@kvman/sdk';
import { notFound } from '../problems.ts';
import { findSession } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { chatIdOf } from './artifact-records.ts';

// The person's view of a chat's artifacts (plan 08 §8.6, ADR 0009, 176): list and read. Only the agent writes, and a
// subagent session answers with the artifacts of the chat at its root.

const formatSchema = z.enum(['markdown', 'html']);

export function registerArtifacts(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.artifact.list', {
    description: 'Lists the artifacts of a chat, newest change first.',
    input: z.object({ sessionId: z.string() }),
    output: z.array(z.object({ id: z.string(), title: z.string(), format: formatSchema, version: z.number().int(), size: z.number().int(), updatedAt: z.string() })),
    public: true,
    handle: async ({ sessionId }) => {
      const chatId = chatIdOf(await findSession(ctx, sessionId));
      return (await records(ctx.store).artifacts.find({ sessionId: chatId }, { limit: 1000 }))
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.artifactId.localeCompare(second.artifactId))
        .map((doc) => ({ id: doc.artifactId, title: doc.title, format: doc.format, version: doc.version, size: Buffer.byteLength(doc.content), updatedAt: doc.updatedAt }));
    },
  });
  ctx.registerQuery('kvcoder.artifact.get', {
    description: 'Gives one artifact of a chat with its content.',
    input: z.object({ sessionId: z.string(), id: z.string().min(1) }),
    output: z.object({ id: z.string(), title: z.string(), format: formatSchema, version: z.number().int(), content: z.string(), createdAt: z.string(), updatedAt: z.string() }),
    public: true,
    handle: async ({ sessionId, id }) => {
      const chatId = chatIdOf(await findSession(ctx, sessionId));
      const found = (await records(ctx.store).artifacts.find({ sessionId: chatId, artifactId: id }, { limit: 1 }))[0];
      if (found === undefined) throw notFound(`The artifact ${id} doesn't exist.`, { id });
      return { id: found.artifactId, title: found.title, format: found.format, version: found.version, content: found.content, createdAt: found.createdAt, updatedAt: found.updatedAt };
    },
  });
}

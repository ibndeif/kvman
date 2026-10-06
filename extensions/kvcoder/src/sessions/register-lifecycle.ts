import { ProblemError, z, type Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import { settingSchemas } from '../register-settings.ts';
import { records } from '../store/collections.ts';
import { messagesFrom } from '../turns/message-blocks.ts';
import { textOf } from '../turns/model-context.ts';
import { deleteSessionTree } from './new-session.ts';

// A session's life around its turns (plan 08 §8.1): the title kvai writes after the first turn, and daily retention.

const titler = 'Write a title of 3 to 6 words for the conversation below, in the language it is written in. Reply with the title only.';

async function writeTitle(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  const session = await store.sessions.get(sessionId);
  if (session === undefined || !session.autoTitle) return;
  const opening = (await messagesFrom(ctx, sessionId, 0, Math.min(session.nextSeq, 20))).filter((message) => message.kind === 'user' || message.kind === 'assistant');
  const transcript = opening.map((message) => `${message.kind === 'user' ? 'User' : 'Assistant'}: ${textOf(message.content['content'])}`).join('\n\n');
  try {
    const answer = await ctx.exec('kvai.complete', { ...(session.model === null ? {} : { model: session.model }), sessionId, systemPrompt: titler, messages: [{ role: 'user', content: transcript, timestamp: Date.now() }], maxTokens: 30 });
    const title = textOf(answer.message.content).trim().replace(/^["'“”]+|["'“”.]+$/g, '').slice(0, 100);
    const fresh = await store.sessions.get(sessionId);
    if (title !== '' && fresh?.autoTitle === true) await store.sessions.update(sessionId, { title, autoTitle: false });
  } catch (error) {
    if (!(error instanceof ProblemError)) throw error;
    ctx.log.info('A session title could not be written; the placeholder stays.', { code: error.problem.code });
  }
}

async function prune(ctx: Ctx): Promise<void> {
  const keep = settingSchemas.keep.parse(await ctx.settings.get('kvcoder.sessions.keep'));
  if (keep === 0) return;
  const sessions = await records(ctx.store).sessions.find({ parentId: null }, { limit: 1000, order: 'desc' });
  for (const session of sessions.slice(keep)) if (session.status === 'idle') await deleteSessionTree(ctx, session.id);
}

export function registerLifecycle(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.session.title', {
    description: "Writes a session's title from its first turn.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({}),
    retries: 0,
    handle: async ({ sessionId }) => {
      await writeTitle(ctx, sessionId);
      return {};
    },
  });
  ctx.registerCommand('kvcoder.session.prune', {
    description: 'Deletes the oldest idle top-level sessions beyond kvcoder.sessions.keep.',
    input: z.object({}),
    output: z.object({}),
    handle: async () => {
      await prune(ctx);
      return {};
    },
  });
}

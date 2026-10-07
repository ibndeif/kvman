import type { Ctx, Json } from '@kvman/sdk';
import { records } from '../store/collections.ts';
import { sentHistory, textOf } from './model-context.ts';

// A read the chat already holds (ADR 0034, 2). It is worked out from the stored messages after the latest summary, so a
// summary, a fork, and a subagent's own chat need no bookkeeping, and a file that changed in any way never matches.

const isRead = (details: Json | undefined): boolean => typeof details === 'object' && details !== null && !Array.isArray(details) && details['connector'] === 'fs' && details['command'] === 'read';

/** Whether a step still sends an `fs read` result with exactly this text. */
export async function alreadyRead(ctx: Ctx, sessionId: string, text: string): Promise<boolean> {
  const session = await records(ctx.store).sessions.get(sessionId);
  if (session === undefined) return false;
  const { messages } = await sentHistory(ctx, sessionId, session.nextSeq);
  return messages.some((message) => message.kind === 'toolResult' && isRead(message.content['details']) && textOf(message.content['content']) === text);
}

/** What a read returns in place of text the chat already holds. */
export const unchangedText = (path: string): string => `${path} is unchanged since you read these lines earlier in this conversation; that result is above.`;

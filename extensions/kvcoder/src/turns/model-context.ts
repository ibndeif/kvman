import { ProblemError, type Ctx, type Json, type Stored } from '@kvman/sdk';
import { messageSchema } from '@kvman/kvai/messages';
import type { MessageDoc } from '../schemas/records.ts';
import { latestSummary, messagesFrom } from './message-blocks.ts';

// What a step sends the model (plan 08 §8.1): the latest summary, then the messages after it; notices, notes, and
// older messages stay visible but aren't sent. Images are read from their files at each step (ADR 0009, 103).

export type History = { summary: Stored<MessageDoc> | undefined; messages: Stored<MessageDoc>[] };

const sent = new Set<MessageDoc['kind']>(['user', 'assistant', 'toolResult']);

/** The summary and the model-visible messages after it. */
export async function sentHistory(ctx: Ctx, sessionId: string, nextSeq: number): Promise<History> {
  const summary = await latestSummary(ctx, sessionId);
  const from = summary === undefined ? 0 : Number(summary.content['coversThroughSeq'] ?? -1) + 1;
  const messages = (await messagesFrom(ctx, sessionId, from, nextSeq)).filter((message) => sent.has(message.kind));
  return { summary, messages };
}

/** A message's text: a string, or its text blocks joined. */
export function textOf(content: Json | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((block) => (typeof block === 'object' && block !== null && !Array.isArray(block) && block['type'] === 'text' && typeof block['text'] === 'string' ? [block['text']] : []))
    .join('\n');
}

async function imageBlock(ctx: Ctx, fileId: string, name: string): Promise<Json> {
  try {
    const file = await ctx.files.get(fileId);
    return { type: 'image', data: (await ctx.files.read(fileId)).toString('base64'), mimeType: file.type };
  } catch (error) {
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return { type: 'text', text: `[image ${name} was deleted]` };
    throw error;
  }
}

async function userMessage(ctx: Ctx, message: Stored<MessageDoc>): Promise<Json> {
  if (message.fileIds === null || message.fileIds.length === 0) return message.content;
  const images = await Promise.all(message.fileIds.map((fileId, index) => imageBlock(ctx, fileId, message.fileNames?.[index] ?? fileId)));
  return { ...message.content, content: [{ type: 'text', text: textOf(message.content['content']) }, ...images] };
}

const summaryLead = 'A summary of the earlier conversation:';

/** The messages a step sends, checked as kvai takes them. */
export async function modelMessages(ctx: Ctx, history: History) {
  const lead: Json[] = history.summary === undefined ? [] : [{ role: 'user', content: `${summaryLead}\n${String(history.summary.content['text'] ?? '')}`, timestamp: Date.parse(history.summary.createdAt) }];
  const rest = await Promise.all(history.messages.map((message) => (message.kind === 'user' ? userMessage(ctx, message) : Promise.resolve<Json>(message.content))));
  return messageSchema.array().parse([...lead, ...rest]);
}

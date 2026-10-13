import { ProblemError, type Ctx, type Json, type Stored } from '@kvman/sdk';
import { messageSchema } from '@kvman/kvai/messages';
import type { MessageDoc } from '../schemas/records.ts';
import { withCallingReply } from './call-groups.ts';
import { blockSize } from './history.ts';
import { latestSummary, messagesFrom } from './message-blocks.ts';
import { messageStamp } from './message-stamp.ts';

// What a step sends the model (plan 08 §8.1): the latest summary, then the messages after it; notices, notes, and
// older messages stay visible but aren't sent. Images are read from their files at each step (ADR 0009, 103). A summary
// stored before ADR 0036, 16 may end between a reply's calls and their results: the messages then start at that reply.

export type History = { summary: Stored<MessageDoc> | undefined; messages: Stored<MessageDoc>[] };

const sent = new Set<MessageDoc['kind']>(['user', 'assistant', 'toolResult']);

/** The summary and the model-visible messages after it. */
export async function sentHistory(ctx: Ctx, sessionId: string, nextSeq: number): Promise<History> {
  const summary = await latestSummary(ctx, sessionId);
  const from = summary === undefined ? 0 : Number(summary.content['coversThroughSeq'] ?? -1) + 1;
  const messages = (await messagesFrom(ctx, sessionId, from, nextSeq)).filter((message) => sent.has(message.kind));
  if (messages[0]?.kind !== 'toolResult') return { summary, messages };
  const before = (await messagesFrom(ctx, sessionId, Math.max(from - blockSize, 0), from)).filter((message) => sent.has(message.kind));
  return { summary, messages: withCallingReply(before, messages) };
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

const isImage = (block: Json | undefined): boolean => typeof block === 'object' && block !== null && !Array.isArray(block) && block['type'] === 'image';

// What was running in the background when the person wrote, as their message stored it (ADR 0068, 4).
function runningNote(running: Json | undefined): string {
  const runs = Array.isArray(running) ? running.filter((run) => typeof run === 'string') : [];
  return runs.length === 0 ? '' : `\n\n[kvman: still running in the background: ${runs.join('; ')}. Use the background connector to wait for, read, or stop one.]`;
}

// The person's own message starts with its date (ADR 0032, 5); one from a job, a subagent, or an extension doesn't.
function sentText(message: Stored<MessageDoc>): string {
  const text = textOf(message.content['content']);
  if (message.source?.kind !== 'user') return text;
  return `${messageStamp(message.createdAt, -new Date(message.createdAt).getTimezoneOffset())}\n${text}${runningNote(message.content['running'])}`;
}

// The images a message shows, named in its text (ADR 0073, 1 and 2): they are in no folder the model could look in.
function imagesNote(names: readonly string[]): string {
  return names.length === 0 ? '' : `\n\nAttached images, shown in this message and not saved as files in the workspace:\n${names.map((name) => `- ${name}`).join('\n')}`;
}

async function userMessage(ctx: Ctx, message: Stored<MessageDoc>): Promise<Json> {
  if (message.fileIds === null || message.fileIds.length === 0) return { ...message.content, content: sentText(message) };
  const names = message.fileIds.map((fileId, index) => message.fileNames?.[index] ?? fileId);
  const images = await Promise.all(message.fileIds.map((fileId, index) => imageBlock(ctx, fileId, names[index] ?? fileId)));
  const shown = names.filter((_name, index) => isImage(images[index]));
  return { ...message.content, content: [{ type: 'text', text: `${sentText(message)}${imagesNote(shown)}` }, ...images] };
}

const summaryLead = 'A summary of the earlier conversation:';

/** A stored summary as it is sent: the model's text, then what kvman added when it stored it (ADR 0066, 2). */
export function summaryText(summary: Pick<MessageDoc, 'content'> | undefined): string {
  if (summary === undefined) return '';
  const facts = summary.content['facts'];
  return typeof facts === 'string' ? `${String(summary.content['text'] ?? '')}\n\n${facts}` : String(summary.content['text'] ?? '');
}

/** The messages a step sends, checked as kvai takes them. */
export async function modelMessages(ctx: Ctx, history: History) {
  const lead: Json[] = history.summary === undefined ? [] : [{ role: 'user', content: `${summaryLead}\n${summaryText(history.summary)}`, timestamp: Date.parse(history.summary.createdAt) }];
  const rest = await Promise.all(history.messages.map((message) => (message.kind === 'user' ? userMessage(ctx, message) : Promise.resolve<Json>(message.content))));
  return messageSchema.array().parse([...lead, ...rest]);
}

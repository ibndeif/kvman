import path from 'node:path';
import { z, type Ctx, type Stored } from '@kvman/sdk';
import { chatIdOf } from '../artifacts/artifact-records.ts';
import { runningInBackground } from '../jobs/job-rows.ts';
import { mapProgress } from '../maps/map-rules.ts';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { textOf } from './model-context.ts';

// What kvman adds to a summary (ADR 0066, 2 to 4): the things it knows for certain when the summary is stored, so the
// next run doesn't depend on the model's words for them. It is written once: what changes later reaches the model at
// the end of the context, and the provider's cache of what follows the summary holds.

const personSchema = z.array(z.object({ at: z.string(), text: z.string() }));

/** A message the person wrote, as a summary keeps it. */
export type PersonMessage = z.output<typeof personSchema>[number];

/** The characters one message keeps, and all of them together. */
export const messageLimit = 1000;
export const personLimit = 6000;

const cut = (text: string): string => (text.length > messageLimit ? `${text.slice(0, messageLimit)}…` : text);

/** The `person` an earlier summary stored; none for a summary from before ADR 0066. */
export function storedPerson(summary: Pick<MessageDoc, 'content'> | undefined): PersonMessage[] {
  const parsed = personSchema.safeParse(summary?.content['person']);
  return parsed.success ? parsed.data : [];
}

/** The person's messages a new summary keeps: the earlier summary's, then those now summarized, the newest that fit. */
export function personMessages(earlier: readonly PersonMessage[], summarized: readonly Pick<Stored<MessageDoc>, 'kind' | 'source' | 'content' | 'createdAt'>[]): { kept: PersonMessage[]; left: number } {
  const said = summarized.filter((message) => message.kind === 'user' && message.source?.kind === 'user').map((message) => ({ at: message.createdAt, text: cut(textOf(message.content['content'])) }));
  const all = [...earlier, ...said];
  let size = 0;
  const from = all.findLastIndex((message) => (size += message.text.length) > personLimit) + 1;
  return { kept: all.slice(from), left: from };
}

const minute = (at: string): string => `${at.slice(0, 16).replace('T', ' ')} UTC`;

function personLines(person: { kept: readonly PersonMessage[]; left: number }): string[] {
  if (person.kept.length === 0) return [];
  const left = person.left === 0 ? '' : ` (${String(person.left)} earlier ones are left out)`;
  return [`The person's own messages, oldest first${left}:`, ...person.kept.map((message) => `- [${minute(message.at)}] ${message.text}`)];
}

async function mapLines(ctx: Ctx, chatId: string): Promise<string[]> {
  const [map] = await records(ctx.store).maps.find({ sessionId: chatId }, { limit: 1 });
  if (map === undefined) return [];
  const state = mapProgress(map);
  const list = (name: string, steps: readonly string[]): string[] => (steps.length === 0 ? [] : [`- ${name}: ${steps.join('; ')}`]);
  return [`The execution map (${state.goal}): ${state.progress}.`, ...list('Doing', state.doing), ...list('Ready', state.ready), ...list('Waiting', state.waiting), ...list('Failed', state.failed), ...map.notes.map((note) => `- Noted for later: ${note.text}`)];
}

async function changedFiles(ctx: Ctx, sessionId: string): Promise<string[]> {
  const copies = await records(ctx.store).fileBackups.find({ sessionId }, { limit: 100, order: 'desc' });
  const files = [...new Set(copies.map((copy) => path.relative(ctx.job.workspace.path, copy.path).split(path.sep).join('/')))];
  return files.length === 0 ? [] : [`Files this chat changed most recently: ${files.join(', ')}.`];
}

async function runningLines(ctx: Ctx, sessionId: string): Promise<string[]> {
  const running = await runningInBackground(ctx, sessionId);
  return running.length === 0 ? [] : ['Still running in the background:', ...running.map((run) => `- ${run}`)];
}

async function artifactLines(ctx: Ctx, chatId: string): Promise<string[]> {
  const artifacts = await records(ctx.store).artifacts.find({ sessionId: chatId }, { limit: 100 });
  return artifacts.length === 0 ? [] : [`Artifacts: ${artifacts.map((artifact) => `${artifact.artifactId} (${artifact.title})`).sort().join(', ')}.`];
}

/** The text kvman stores beside a summary, or nothing when it has nothing to add. */
export async function summaryFacts(ctx: Ctx, session: Stored<SessionDoc>, person: { kept: readonly PersonMessage[]; left: number }): Promise<string | undefined> {
  const chatId = chatIdOf(session);
  const lines = [...personLines(person), ...(await mapLines(ctx, chatId)), ...(await changedFiles(ctx, session.id)), ...(await runningLines(ctx, session.id)), ...(await artifactLines(ctx, chatId))];
  return lines.length === 0 ? undefined : ['What kvman recorded when this summary was written:', ...lines].join('\n');
}

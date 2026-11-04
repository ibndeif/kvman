import { realpath } from 'node:fs/promises';
import { z, type Ctx, type Stored } from '@kvman/sdk';
import { splitAttachments } from '../messages/attachments.ts';
import { receiveMessage } from '../messages/receive-message.ts';
import { acknowledged, sentBy } from '../messages/send-receipt.ts';
import { invalid } from '../problems.ts';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { ownSession, userOnly } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { blockOf } from '../turns/history.ts';
import { textOf } from '../turns/model-context.ts';
import { rewindChat } from './rewind-chat.ts';
import { changedAfter, decideFile, treeOf } from './rewind-files.ts';
import { editedMessage, rewindableMessage, rewoundChat, undoneMessage, type Mark } from './rewind-target.ts';

// Editing and undoing a message (plan 08 §8.6, ADR 0118, 6): the preview of what a rewind would do to files, the edit
// that rewinds and sends in its place, and the undo that rewinds and gives the message back for the send box.

const leftSchema = z.object({ path: z.string(), reason: z.enum(['changedSince', 'tooLarge']) });
const rewoundShape = { restored: z.array(z.string()), deleted: z.array(z.string()), left: z.array(leftSchema) };
const markOf = (message: Stored<MessageDoc>): Mark => ({ seq: message.seq, createdAt: message.createdAt });

// The stored messages from the message on, by block (a block holds at most 500), and the queued ones.
async function removedCount(ctx: Ctx, chat: Stored<SessionDoc>, seq: number): Promise<number> {
  const store = records(ctx.store);
  const first = (await store.messages.find({ sessionId: chat.id, block: blockOf(seq) }, { limit: 1000 })).filter((message) => message.seq >= seq).length;
  let later = 0;
  for (let block = blockOf(seq) + 1; block <= blockOf(Math.max(chat.nextSeq - 1, 0)); block += 1) later += await store.messages.count({ sessionId: chat.id, block });
  return first + later + (await store.queued.count({ sessionId: chat.id }));
}

// What an edit may keep of the message: its own images and attached files, never new ones.
function requireKept(message: Stored<MessageDoc>, fileIds: readonly string[], attachments: readonly string[]): void {
  const images = message.fileIds ?? [];
  const saved = splitAttachments(textOf(message.content['content'])).saved;
  const added = [...fileIds.filter((id) => !images.includes(id)), ...attachments.filter((name) => !saved.includes(name))];
  if (added.length > 0) throw invalid(`An edit keeps the message's own files and adds none: ${added.join(', ')}.`, { files: added });
}

export function registerRewind(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.rewind.files.list', {
    description: "Lists what rewinding a chat to just before a message would do to the files kvman changed after it, how many messages would go, and whether the chat is busy; changes nothing.",
    input: z.object({ sessionId: z.string(), seq: z.number().int().nonnegative() }),
    output: z.object({ files: z.array(z.object({ path: z.string(), state: z.enum(['restore', 'delete', 'changedSince', 'tooLarge']) })), messages: z.number().int(), running: z.boolean() }),
    public: true,
    handle: async ({ sessionId, seq }) => {
      userOnly(ctx, 'kvcoder.rewind.files.list');
      const chat = await rewoundChat(ctx, sessionId);
      const mark = markOf(await rewindableMessage(ctx, chat, seq));
      const sessions = await treeOf(ctx, chat.id);
      const base = await realpath(ctx.job.workspace.path);
      const paths = await changedAfter(ctx, sessions, mark);
      const files = await ctx.store.transaction((tx) => paths.flatMap((real) => decideFile(txRecords(tx), sessions, real, mark, base) ?? []));
      return { files: files.sort((first, second) => first.path.localeCompare(second.path)), messages: await removedCount(ctx, chat, seq), running: chat.status !== 'idle' };
    },
  });
  ctx.registerCommand('kvcoder.message.edit', {
    description: "Rewinds a chat to just before a message the person typed, with kvman's file changes after it when files is true, and sends the new text in its place.",
    input: z.object({ sessionId: z.string(), seq: z.number().int().nonnegative(), text: z.string().min(1), fileIds: z.array(z.string()).exactOptional(), attachments: z.array(z.string().min(1)).exactOptional(), files: z.boolean(), sendId: z.string().min(1).max(100).exactOptional() }),
    output: z.object(rewoundShape),
    public: true,
    retries: 0,
    handle: async ({ sessionId, seq, text, fileIds, attachments, files, sendId }) => {
      userOnly(ctx, 'kvcoder.message.edit');
      const chat = await rewoundChat(ctx, sessionId);
      // A repeat is known by its receipt before anything is rewound (ADR 0048).
      if (sendId !== undefined && acknowledged((await records(ctx.store).sendReceipts.find({ sendId }, { limit: 1 }))[0], sentBy(sendId, chat.id, text, fileIds ?? [], attachments ?? []))) return { restored: [], deleted: [], left: [] };
      const message = await editedMessage(ctx, chat, seq);
      requireKept(message, fileIds ?? [], attachments ?? []);
      const rewound = await rewindChat(ctx, chat, message, files);
      await receiveMessage(ctx, await ownSession(ctx, chat.id), { text, fileIds: fileIds ?? [], attachments, source: { kind: 'user' }, mayStart: true, sendId }, true);
      return rewound;
    },
  });
  ctx.registerCommand('kvcoder.message.undo', {
    description: "Rewinds a chat to just before its latest message the person typed or a slash command sent, with kvman's file changes after it when files is true, and returns that message for the send box.",
    input: z.object({ sessionId: z.string(), files: z.boolean() }),
    output: z.object({ text: z.string(), fileIds: z.array(z.string()), fileNames: z.array(z.string()), attachments: z.array(z.string()), ...rewoundShape }),
    public: true,
    retries: 0,
    handle: async ({ sessionId, files }) => {
      userOnly(ctx, 'kvcoder.message.undo');
      const chat = await rewoundChat(ctx, sessionId);
      const message = await undoneMessage(ctx, chat);
      const { typed, saved } = splitAttachments(textOf(message.content['content']));
      const rewound = await rewindChat(ctx, chat, message, files);
      return { text: typed, fileIds: message.fileIds ?? [], fileNames: message.fileNames ?? [], attachments: saved, ...rewound };
    },
  });
}

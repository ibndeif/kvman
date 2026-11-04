import { realpath } from 'node:fs/promises';
import type { Ctx, Stored } from '@kvman/sdk';
import { dropRun } from '../delegate/runs.ts';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { deleteSessionTree } from '../sessions/new-session.ts';
import { allDocs } from '../store/all-docs.ts';
import { records, txRecords } from '../store/collections.ts';
import { cancelTurn } from '../turns/end-turn.ts';
import { changedAfter, rewindFile, treeOf, type FileDecision } from './rewind-files.ts';
import { dropRecords } from './rewind-records.ts';
import { isAfter, type Mark } from './rewind-target.ts';

// Rewinding a chat to just before a message (ADR 0118, 1), in this order: the turn stops; what started after the
// message stops (helpers, program workers' runs) or is made quiet (processes); the files go back; the records go; and
// last the helpers that started after it are deleted, once their changes were taken back.

export type Rewound = { restored: string[]; deleted: string[]; left: { path: string; reason: 'changedSince' | 'tooLarge' }[] };

// Helpers made after the message: deleting is marked first, so no change of theirs lands after it (ADR 0118, 5).
async function stopHelpers(ctx: Ctx, chatId: string, mark: Mark): Promise<string[]> {
  const store = records(ctx.store);
  const helpers = (await allDocs((options) => store.sessions.find({ parentId: chatId }, options))).filter((child) => isAfter(child.atSeq, child.createdAt, mark));
  for (const helper of helpers) {
    await store.sessions.update(helper.id, { deleting: true });
    await cancelTurn(ctx, helper.id, false);
  }
  return helpers.map((helper) => helper.id);
}

// Program workers' runs started after the message stop telling no one; processes keep running, but quiet.
async function stopStarted(ctx: Ctx, sessions: readonly string[], mark: Mark): Promise<void> {
  const store = records(ctx.store);
  for (const sessionId of sessions) {
    for (const run of await allDocs((options) => store.runs.find({ sessionId }, options))) {
      if (!isAfter(run.atSeq, run.startedAt, mark)) continue;
      await dropRun(ctx, run);
      await store.runs.delete(run.id);
    }
    for (const process of await allDocs((options) => store.processes.find({ sessionId }, options))) {
      if (isAfter(process.atSeq, process.startedAt, mark)) await store.processes.update(process.id, { quiet: true });
    }
  }
}

// Files kept as they are keep their records under the chat, so a later rewind can still take them back.
async function keepHelperCopies(ctx: Ctx, chatId: string, helpers: readonly string[]): Promise<void> {
  for (const helper of await treeOfAll(ctx, helpers)) {
    await ctx.store.transaction((tx) => {
      const store = txRecords(tx);
      // A moved record leaves the filter, so each page is a fresh first page.
      for (let page = store.fileBackups.find({ sessionId: helper }, { limit: 1000 }); page.length > 0; page = store.fileBackups.find({ sessionId: helper }, { limit: 1000 })) for (const copy of page) store.fileBackups.update(copy.id, { sessionId: chatId });
      for (let page = store.fileCopies.find({ sessionId: helper }, { limit: 1000 }); page.length > 0; page = store.fileCopies.find({ sessionId: helper }, { limit: 1000 })) for (const kept of page) store.fileCopies.update(kept.id, { sessionId: chatId });
    });
  }
}

async function treeOfAll(ctx: Ctx, roots: readonly string[]): Promise<string[]> {
  return (await Promise.all(roots.map((root) => treeOf(ctx, root)))).flat();
}

async function rewindFiles(ctx: Ctx, chatId: string, sessions: readonly string[], mark: Mark): Promise<Rewound> {
  const base = await realpath(ctx.job.workspace.path);
  const decided: FileDecision[] = [];
  for (const real of await changedAfter(ctx, sessions, mark)) {
    const decision = await rewindFile(ctx, chatId, sessions, real, mark, base);
    if (decision !== undefined) decided.push(decision);
  }
  const named = (state: FileDecision['state']) => decided.filter((file) => file.state === state).map((file) => file.path);
  return { restored: named('restore'), deleted: named('delete'), left: decided.flatMap((file) => (file.state === 'changedSince' || file.state === 'tooLarge' ? [{ path: file.path, reason: file.state }] : [])) };
}

/** Rewinds the chat to just before `message`; with `files`, kvman's own changes after it go back too. */
export async function rewindChat(ctx: Ctx, chat: Stored<SessionDoc>, message: Stored<MessageDoc>, files: boolean): Promise<Rewound> {
  const mark: Mark = { seq: message.seq, createdAt: message.createdAt };
  await cancelTurn(ctx, chat.id, false);
  const helpers = await stopHelpers(ctx, chat.id, mark);
  const sessions = await treeOf(ctx, chat.id);
  await stopStarted(ctx, sessions, mark);
  const rewound = files ? await rewindFiles(ctx, chat.id, sessions, mark) : { restored: [], deleted: [], left: [] };
  if (!files) await keepHelperCopies(ctx, chat.id, helpers);
  await dropRecords(ctx, chat.id, sessions, mark, helpers);
  for (const helper of helpers) await deleteSessionTree(ctx, helper);
  return rewound;
}

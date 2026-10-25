import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z, type Ctx, type Stored } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import type { FileChangeDoc, SessionDoc } from '../schemas/records.ts';
import { findSession, userOnly } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { copyDiff, gitIn, headDiff, type FileDiff, type FileState, type Git } from './change-diff.ts';
import { undoChange } from './file-change.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// A chat's changes (plan 08 §8.6 and §8.7, ADR 0093, 2): the files its tree changed with `fs`, each diffed, and the
// person's undo of one.

const changesLimit = 200;
const fileSchema = z.object({ path: z.string(), added: z.number().int(), removed: z.number().int(), diff: z.string(), state: z.enum(['changed', 'created', 'deleted']) });

// The chat at the root of a session, and every session in its tree.
async function chatTree(ctx: Ctx, session: Stored<SessionDoc>): Promise<{ root: string; sessions: string[] }> {
  const root = session.parentId ?? session.id;
  const children = await records(ctx.store).sessions.find({ parentId: root }, { limit: 1000 });
  return { root, sessions: [root, ...children.map((child) => child.id)] };
}

// The oldest copy the tree keeps of a file: its content before the chat changed it, `null` when the chat created it.
async function oldestCopy(ctx: Ctx, sessions: readonly string[], real: string): Promise<{ previous: Buffer | null; sessionId: string } | undefined> {
  const copies = (await Promise.all(sessions.map((sessionId) => records(ctx.store).fileBackups.find({ sessionId, path: real }, { limit: 1000 })))).flat();
  const oldest = copies.sort((first, second) => first.createdAt.localeCompare(second.createdAt))[0];
  return oldest === undefined ? undefined : { previous: oldest.previous === null ? null : Buffer.from(oldest.previous, 'base64'), sessionId: oldest.sessionId };
}

const exists = (real: string): Promise<boolean> => stat(real).then(() => true, () => false);

async function fileView(ctx: Ctx, git: Git, tracked: boolean, sessions: readonly string[], base: string, change: Stored<FileChangeDoc>) {
  const shown = path.relative(base, change.path).split(path.sep).join('/');
  const present = await exists(change.path);
  const inHead = tracked && (await git(['cat-file', '-e', `HEAD:${shown}`]))?.code === 0;
  const copy = inHead ? undefined : await oldestCopy(ctx, sessions, change.path);
  const state: FileState = !present ? 'deleted' : !inHead && copy?.previous === null ? 'created' : 'changed';
  const found: FileDiff | undefined = inHead ? await headDiff(git, shown) : copy === undefined ? { added: 0, removed: 0, diff: '' } : await copyDiff(git, shown, present ? change.path : undefined, copy.previous);
  return { path: shown, state, ...(found ?? { added: 0, removed: 0, diff: '' }), ran: found !== undefined };
}

// The chat's latest turn, whose changes are this turn's (ADR 0102, 9); ids are ordered by when they were made.
async function latestTurn(ctx: Ctx, chatId: string): Promise<string | undefined> {
  const turns = await records(ctx.store).turns.find({ sessionId: chatId }, { limit: 1000 });
  return turns.map((turn) => turn.id).sort().at(-1);
}

export function registerChanges(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.change.list', {
    description: "Lists the files a chat changed with fs, newest first, each with its diff.",
    input: z.object({ sessionId: z.string(), withDiffs: z.boolean().exactOptional(), scope: z.enum(['turn', 'chat']).exactOptional() }),
    output: z.object({ files: z.array(fileSchema), diffs: z.boolean() }),
    public: true,
    handle: async ({ sessionId, withDiffs, scope }) => {
      const tree = await chatTree(ctx, await findSession(ctx, sessionId));
      const turnId = scope === 'turn' ? await latestTurn(ctx, tree.root) : undefined;
      const changes = (await records(ctx.store).fileChanges.find({ sessionId: tree.root }, { limit: 1000 })).filter((change) => turnId === undefined || change.turnId === turnId).sort((first, second) => second.lastAt.localeCompare(first.lastAt)).slice(0, changesLimit);
      const base = await realpath(ctx.job.workspace.path);
      // The header's count needs the files only: no Git runs (ADR 0093, 2).
      if (withDiffs === false) return { files: await Promise.all(changes.map(async (change) => ({ path: path.relative(base, change.path).split(path.sep).join('/'), added: 0, removed: 0, diff: '', state: (await exists(change.path)) ? ('changed' as const) : ('deleted' as const) }))), diffs: false };
      const git = gitIn(base, ctx.job.signal);
      const tracked = (await git(['rev-parse', '--is-inside-work-tree']))?.out.trim() === 'true';
      const files = [];
      for (const change of changes) files.push(await fileView(ctx, git, tracked, tree.sessions, base, change));
      return { files: files.map(({ ran: _ran, ...file }) => file), diffs: files.every((file) => file.ran) };
    },
  });
  ctx.registerCommand('kvcoder.change.undo', {
    description: "Takes back the chat's latest change to a file, as fs undo does; for the person.",
    input: z.object({ sessionId: z.string(), path: z.string().min(1) }),
    output: z.object({}),
    public: true,
    retries: 0,
    handle: async ({ sessionId, path: shown }) => {
      userOnly(ctx, 'kvcoder.change.undo');
      const session = await findSession(ctx, sessionId);
      if (session.parentId !== null) throw invalid("A helper's chat is for reading; undo from its chat.", { sessionId });
      const tree = await chatTree(ctx, session);
      const real = await resolveInWorkspace(ctx.job.workspace.path, shown);
      // The tree's newest change of the file, whichever session of the chat made it.
      const copies = (await Promise.all(tree.sessions.map((id) => records(ctx.store).fileBackups.find({ sessionId: id, path: real }, { limit: 1, order: 'desc' })))).flat();
      const newest = copies.sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];
      await undoChange(ctx, { sessionId: newest?.sessionId ?? sessionId, shown, real });
      return {};
    },
  });
}

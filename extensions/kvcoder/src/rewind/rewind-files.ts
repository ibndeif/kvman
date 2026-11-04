import { mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Ctx } from '@kvman/sdk';
import { existing, fingerprintOf, refusal, replace } from '../files/file-change.ts';
import { beforeOf, byOrder, copiesOf, dropCopy, type Before, type Copy } from '../files/file-copies.ts';
import { allDocs } from '../store/all-docs.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { isAfter, type Mark } from './rewind-target.ts';

// The files of a rewind (ADR 0118, 2): for each file the chat's tree changed with `fs` after the message, its changes
// after it are taken newest first as one. The file goes back to what it held before the oldest, or is deleted when kvman
// created it, only while it still holds what the newest wrote; otherwise it is left. Each file is decided and written
// in its own transaction, so a rewind cut short goes on where it stopped when it runs again.

export type FileState = 'restore' | 'delete' | 'changedSince' | 'tooLarge';
export type FileDecision = { path: string; state: FileState };

type Planned = { state: FileState | 'none'; after: Copy[]; target: Before; mode: number | undefined };

/** The chat and every session below it. */
export async function treeOf(ctx: Ctx, chatId: string): Promise<string[]> {
  const found = [chatId];
  for (let index = 0; index < found.length; index += 1) {
    const parent = found[index] ?? '';
    found.push(...(await allDocs((options) => records(ctx.store).sessions.find({ parentId: parent }, options))).map((child) => child.id));
  }
  return found;
}

/** The files the tree changed after the message, by real path. */
export async function changedAfter(ctx: Ctx, sessions: readonly string[], mark: Mark): Promise<string[]> {
  const paths = new Set<string>();
  for (const sessionId of sessions) {
    for (const copy of await allDocs((options) => records(ctx.store).fileBackups.find({ sessionId }, options))) if (isAfter(copy.atSeq, copy.createdAt, mark)) paths.add(copy.path);
  }
  return [...paths].sort();
}

const shownPath = (base: string, real: string): string => path.relative(base, real).split(path.sep).join('/');

function planFile(store: TxRecords, sessions: readonly string[], real: string, mark: Mark, base: string): Planned | undefined {
  const after = sessions.flatMap((sessionId) => copiesOf(store, sessionId, real)).filter((copy) => isAfter(copy.atSeq, copy.createdAt, mark)).sort(byOrder);
  const [oldest, newest] = [after[0], after.at(-1)];
  if (oldest === undefined || newest === undefined) return undefined;
  const target = beforeOf(store, oldest);
  const found = existing({ shown: shownPath(base, real), real });
  const holdsNewest = newest.written === null ? found === undefined : found !== undefined && fingerprintOf(found.bytes) === newest.written;
  const plan = (state: Planned['state']): Planned => ({ state, after, target, mode: found?.mode });
  if (!holdsNewest) return plan('changedSince');
  if (target.kind === 'tooLarge') return plan('tooLarge');
  if (target.kind === 'absent') return plan(found === undefined ? 'none' : 'delete');
  return plan(found !== undefined && found.bytes.equals(target.bytes) ? 'none' : 'restore');
}

/** What rewinding to the message would do to one file, writing nothing; `undefined` when nothing would change. */
export function decideFile(store: TxRecords, sessions: readonly string[], real: string, mark: Mark, base: string): FileDecision | undefined {
  const planned = planFile(store, sessions, real, mark, base);
  return planned === undefined || planned.state === 'none' ? undefined : { path: shownPath(base, real), state: planned.state };
}

// The tree's record of the file in the Changes view follows its newest change left, or goes with the last one.
function followChanges(store: TxRecords, sessions: readonly string[], chatId: string, real: string): void {
  const [noted] = store.fileChanges.find({ sessionId: chatId, path: real }, { limit: 1 });
  if (noted === undefined) return;
  const newest = sessions.flatMap((sessionId) => copiesOf(store, sessionId, real)).sort(byOrder).at(-1);
  if (newest === undefined) store.fileChanges.delete(noted.id);
  else store.fileChanges.update(noted.id, { lastAt: newest.createdAt, turnId: newest.turnId });
}

// The records taken back go; a change an undo among them had undone counts again.
function dropAfter(store: TxRecords, after: readonly Copy[]): void {
  const dropped = new Set(after.map((copy) => copy.id));
  for (const copy of after) {
    dropCopy(store, copy);
    if (copy.undoes !== null && !dropped.has(copy.undoes) && store.fileBackups.get(copy.undoes) !== undefined) store.fileBackups.update(copy.undoes, { undone: false });
  }
}

function write(real: string, planned: Planned, jobId: string): void {
  try {
    if (planned.state === 'delete') unlinkSync(real);
    if (planned.state !== 'restore' || planned.target.kind !== 'content') return;
    mkdirSync(path.dirname(real), { recursive: true });
  } catch (error) {
    throw refusal(error);
  }
  replace(real, planned.target.bytes, planned.mode, jobId);
}

/** Rewinds one file, with its records, in one transaction. */
export function rewindFile(ctx: Ctx, chatId: string, sessions: readonly string[], real: string, mark: Mark, base: string): Promise<FileDecision | undefined> {
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const planned = planFile(store, sessions, real, mark, base);
    if (planned === undefined) return undefined;
    write(real, planned, ctx.job.id);
    dropAfter(store, planned.after);
    for (const sessionId of sessions) for (const view of store.fileViews.find({ sessionId, path: real }, { limit: 1 })) store.fileViews.delete(view.id);
    followChanges(store, sessions, chatId, real);
    return planned.state === 'none' ? undefined : { path: shownPath(base, real), state: planned.state };
  });
}

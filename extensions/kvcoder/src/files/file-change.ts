import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { invalid, notFound } from '../problems.ts';
import { executionRootInTx } from '../sessions/execution-root.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// A change to a workspace file (ADR 0053): its read, its checks, and its replace run inside one store transaction, whose
// write lock makes kvman's workers take turns. A chat changes an existing file only as it last saw it, the new content
// is renamed over the file, and the previous content is kept so the change can be undone.

/** The copies a chat keeps, and the largest previous content one holds. */
export const copiesKept = 20;
export const copyLimit = 1024 * 1024;

/** A file as a chat names it and as the file system knows it. */
export type ChangedFile = { sessionId: string; shown: string; real: string };

export const fingerprintOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const codeOf = (error: unknown): string | undefined => (error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined);

// The file system's own refusals are the model's to read and fix; anything else is a fault.
function refusal(error: unknown): unknown {
  return !(error instanceof ProblemError) && error instanceof Error && /^E[A-Z]+$/.test(codeOf(error) ?? '') ? invalid(error.message) : error;
}

function existing(file: ChangedFile): { bytes: Buffer; mode: number } | undefined {
  try {
    const found = statSync(file.real);
    if (found.isDirectory()) throw invalid(`${file.shown} is a folder.`, { path: file.shown });
    return { bytes: readFileSync(file.real), mode: found.mode & 0o777 };
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return undefined;
    throw refusal(error);
  }
}

// Written beside the file and renamed over it, so a reader sees the old content or the new, never part of one.
function replace(real: string, content: Buffer, mode: number | undefined, jobId: string): void {
  const beside = `${real}.${jobId}.kvman-tmp`;
  try {
    writeFileSync(beside, content);
    if (mode !== undefined) chmodSync(beside, mode);
    renameSync(beside, real);
  } catch (error) {
    rmSync(beside, { force: true });
    throw refusal(error);
  }
}

function setView(store: TxRecords, file: ChangedFile, fingerprint: string): void {
  const [view] = store.fileViews.find({ sessionId: file.sessionId, path: file.real }, { limit: 1 });
  if (view === undefined) store.fileViews.insert({ sessionId: file.sessionId, path: file.real, fingerprint, updatedAt: now() });
  else store.fileViews.update(view.id, { fingerprint, updatedAt: now() });
}

function requireSeen(store: TxRecords, file: ChangedFile, bytes: Buffer): void {
  const [view] = store.fileViews.find({ sessionId: file.sessionId, path: file.real }, { limit: 1 });
  if (view === undefined) throw invalid(`${file.shown} exists and this chat hasn't read it. Read it first with fs read, then make the change.`, { path: file.shown });
  if (view.fingerprint !== fingerprintOf(bytes)) throw invalid(`${file.shown} changed since this chat read it. Read it again with fs read, then make the change.`, { path: file.shown });
}

// The chat at the root records each file its tree changed, once, with when it last did (ADR 0093, 2).
function noteChange(store: TxRecords, file: ChangedFile): void {
  const root = executionRootInTx(store, file.sessionId);
  const sessionId = root?.id ?? file.sessionId;
  const turnId = root?.turnId ?? null;
  const [noted] = store.fileChanges.find({ sessionId, path: file.real }, { limit: 1 });
  if (noted === undefined) store.fileChanges.insert({ sessionId, path: file.real, firstAt: now(), lastAt: now(), turnId });
  else store.fileChanges.update(noted.id, { lastAt: now(), turnId });
}

function saveCopy(store: TxRecords, file: ChangedFile, previous: Buffer | undefined, written: string): void {
  if (previous !== undefined && previous.length > copyLimit) return;
  store.fileBackups.insert({ sessionId: file.sessionId, path: file.real, previous: previous === undefined ? null : previous.toString('base64'), written, createdAt: now() });
  for (const old of store.fileBackups.find({ sessionId: file.sessionId }, { limit: 1000, order: 'desc' }).slice(copiesKept)) store.fileBackups.delete(old.id);
}

/** Changes the file to what `plan` makes of its current content; `created` says whether it was new. */
export function changeFile<Value>(ctx: Ctx, file: ChangedFile, plan: (previous: Buffer | undefined, store: TxRecords) => { content: Buffer; value: Value }): Promise<Value & { created: boolean }> {
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const found = existing(file);
    // What is wrong with the change itself is said first; then whether the chat may make it.
    const planned = plan(found?.bytes, store);
    if (found !== undefined) requireSeen(store, file, found.bytes);
    const written = fingerprintOf(planned.content);
    saveCopy(store, file, found?.bytes, written);
    setView(store, file, written);
    noteChange(store, file);
    replace(file.real, planned.content, found?.mode, ctx.job.id);
    return { ...planned.value, created: found === undefined };
  });
}

/** Takes back the chat's latest change to the file, when the file still holds what that change wrote. */
export function undoChange(ctx: Ctx, file: ChangedFile): Promise<{ path: string; removed: boolean; bytes: number }> {
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const [copy] = store.fileBackups.find({ sessionId: file.sessionId, path: file.real }, { limit: 1, order: 'desc' });
    if (copy === undefined) throw notFound(`This chat has no change of ${file.shown} to undo.`, { path: file.shown });
    const found = existing(file);
    if (found === undefined || fingerprintOf(found.bytes) !== copy.written) throw invalid(`${file.shown} changed since that change, so it isn't undone. Read it to see what it holds now.`, { path: file.shown });
    store.fileBackups.delete(copy.id);
    noteChange(store, file);
    const previous = copy.previous === null ? undefined : Buffer.from(copy.previous, 'base64');
    if (previous === undefined) {
      for (const view of store.fileViews.find({ sessionId: file.sessionId, path: file.real }, { limit: 1 })) store.fileViews.delete(view.id);
      try {
        unlinkSync(file.real);
      } catch (error) {
        throw refusal(error);
      }
      return { path: file.shown, removed: true, bytes: 0 };
    }
    setView(store, file, fingerprintOf(previous));
    replace(file.real, previous, found.mode, ctx.job.id);
    return { path: file.shown, removed: false, bytes: previous.length };
  });
}

/** Records the file as the chat has just read it; a file that is gone again records nothing. */
export async function recordFileView(ctx: Ctx, sessionId: string, requested: string): Promise<void> {
  const real = await resolveInWorkspace(ctx.job.workspace.path, requested);
  const bytes = await readFile(real).catch((error: unknown) => {
    if (codeOf(error) === 'ENOENT') return undefined;
    throw error;
  });
  if (bytes === undefined) return;
  await ctx.store.transaction((tx) => setView(txRecords(tx), { sessionId, shown: requested, real }, fingerprintOf(bytes)));
}

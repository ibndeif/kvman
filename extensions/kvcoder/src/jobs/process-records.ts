import type { Ctx, Stored } from '@kvman/sdk';
import type { ProcessDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';

// A background process's record (ADR 0009, 150): its name in the kernel's process service, how it ends, and its status.

/** The extension name the kernel's process service records for kvcoder's processes. */
export const ownerName = '@kvman/kvcoder';

export const processName = (id: string): string => `job-${id}`;

/** The record id a process name `job-<id>` stands for, or `undefined` for another name. */
export const processId = (name: string): string | undefined => (name.startsWith('job-') ? name.slice('job-'.length) : undefined);

export type ProcessStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';

export function processStatus(doc: ProcessDoc): ProcessStatus {
  if (doc.end === undefined) return 'running';
  if (doc.end === 'exited') return doc.exitCode === 0 ? 'succeeded' : 'failed';
  return doc.end === 'interrupted' ? 'interrupted' : 'cancelled';
}

export type EndPatch = Pick<ProcessDoc, 'end' | 'reported'> & Partial<Pick<ProcessDoc, 'exitCode' | 'signal'>>;

/** Records how a process ended, once: the record when this call set the end, `undefined` when it had ended already. */
export async function markEnd(ctx: Ctx, id: string, patch: EndPatch): Promise<Stored<ProcessDoc> | undefined> {
  return ctx.store.transaction((tx) => {
    const doc = txRecords(tx).processes.get(id);
    if (doc === undefined || doc.end !== undefined) return undefined;
    return txRecords(tx).processes.update(id, { ...patch, endedAt: now() });
  });
}

/** A session's process, or `undefined` when the session has none with that id. */
export async function sessionProcess(ctx: Ctx, sessionId: string, id: string): Promise<Stored<ProcessDoc> | undefined> {
  const doc = await records(ctx.store).processes.get(id);
  return doc?.sessionId === sessionId ? doc : undefined;
}

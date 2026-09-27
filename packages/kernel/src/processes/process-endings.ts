import { createReadStream, existsSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { processLimits, type OutboundSend, type ProcessExit, type ProcessResult } from '@kvman/protocol';
import type { BlobStore } from '../blobs/blob-store.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { CommitResult } from '../storage/commit-unit.ts';
import { processRef, type ProcessEnd, type ProcessRecord } from '../storage/process-rows.ts';
import { truncationMarker } from './process-output.ts';

const longestMarker = truncationMarker(processLimits.maxLogCapBytes).length;
const markerAtEnd = /\n\[kvman: output truncated at \d+ bytes\]\n$/;

export type EndingDeps = { store: BlobStore; pipeline: CommitPipeline; logger: KernelLogger };

// 03 §3.7, ADR 0139: a finished log becomes a text blob held by the kernel ref process:<processId> while the row lives.
export async function finalizeLog(store: BlobStore, record: Pick<ProcessRecord, 'processId' | 'logPath'>): Promise<string> {
  const intake = await store.intake(processLimits.maxLogCapBytes + longestMarker);
  try {
    if (existsSync(record.logPath)) {
      for await (const chunk of createReadStream(record.logPath)) {
        if (!(chunk instanceof Buffer)) throw new Error('a process log read as text');
        await intake.write(chunk);
      }
    }
    const taken = await intake.finish();
    return store.register(taken, { mime: 'text/plain' }, { owner: 'kernel', ws: '', ref: processRef(record.processId), expiresAt: null }).blobId;
  } catch (error) {
    await intake.discard();
    throw error;
  }
}

// The tail of a log that a crash left on disk: its last 4 KB of kept output, from a character boundary.
export async function tailOfLog(logPath: string): Promise<string> {
  if (!existsSync(logPath)) return '';
  const handle = await open(logPath, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, processLimits.tailBytes + longestMarker);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const kept = Buffer.from(buffer.toString('latin1').replace(markerAtEnd, ''), 'latin1');
    const tail = kept.subarray(Math.max(0, kept.length - processLimits.tailBytes));
    let start = 0;
    while (start < tail.length && ((tail[start] ?? 0) & 0xc0) === 0x80) start += 1;
    return tail.subarray(start).toString('utf8');
  } finally {
    await handle.close();
  }
}

function exitOf(end: ProcessEnd, result: ProcessResult): ProcessExit {
  return { processId: end.processId, reason: end.reason, ...result };
}

function onExitSends(record: ProcessRecord, end: ProcessEnd, result: ProcessResult): OutboundSend[] {
  if (!record.detached || record.onExit === undefined) return [];
  return [{ type: record.onExit, payload: exitOf(end, result), idempotencyKey: `${record.processId}:exit` }];
}

// The row's end and a detached process's onExit commit in one unit, sent by the kernel under the spawning message. An
// onExit its handler can no longer take (disabled, a schema that refuses it) is logged, and the end commits alone so
// the row never stays running; a storage failure leaves the row for boot reconciliation.
export async function commitEnd(deps: EndingDeps, record: ProcessRecord, end: ProcessEnd, result: ProcessResult): Promise<CommitResult> {
  const unit = (sends: OutboundSend[]) => deps.pipeline.enqueue({ origin: { kind: 'process', end, cause: record.spawnedBy }, writes: [], sends, publishes: [], replies: [] });
  const sends = onExitSends(record, end, result);
  const first = await unit(sends);
  if (first.committed || sends.length === 0 || first.problem.code.startsWith('STORAGE_')) return first;
  deps.logger.write({
    level: 'warn', message: 'the onExit command of a process was refused', fields: { processId: record.processId, code: first.problem.code },
    attributes: { correlationId: record.spawnedBy.correlationId, messageId: record.messageId, extension: record.extension },
  });
  return unit([]);
}

export function removeLog(logPath: string): void {
  rmSync(logPath, { force: true });
}

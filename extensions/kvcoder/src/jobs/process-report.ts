import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import type { ProcessDoc } from '../schemas/records.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';
import { records } from '../store/collections.ts';
import { processName } from './process-records.ts';
import { lastLines } from './process-text.ts';

// Telling a session how a background process ended (ADR 0009, 150): one background message with the outcome and the
// last 20 lines of output. It never starts a turn, since a handler's jobs carry the `fromHandler` mark.

const reportLines = 20;

/** A process's last lines of output; none when it left no log. */
export async function outputTail(ctx: Ctx, id: string, lines: number): Promise<string> {
  try {
    return lastLines(await ctx.processes.log(processName(id), { tail: lines }), lines);
  } catch (error) {
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return '';
    throw error;
  }
}

function outcome(doc: ProcessDoc): string {
  if (doc.end === 'person') return 'was stopped by the person.';
  if (doc.end === 'interrupted') return 'was interrupted because kvman stopped.';
  if (doc.end === 'exited' && doc.exitCode !== null && doc.exitCode !== undefined) return `exited with code ${String(doc.exitCode)}.`;
  return `was killed by ${doc.signal ?? 'a signal'}.`;
}

export async function reportEnd(ctx: Ctx, doc: Stored<ProcessDoc>): Promise<void> {
  const tail = await outputTail(ctx, doc.id, reportLines);
  const text = `The process ${outcome(doc)}${tail === '' ? '' : `\nIts last output:\n${tail}`}`;
  await appendBackground(ctx, doc.sessionId, { kind: 'job', jobId: doc.id }, backgroundText(doc.call, doc.id, text), false);
}

/** Reports the endings no handler could write into this session (kvman stopped or died), once each. */
export async function reportInterrupted(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  for (const doc of await store.processes.find({ sessionId, reported: false }, { limit: 1000 })) {
    if (doc.end === undefined) continue;
    await store.processes.update(doc.id, { reported: true });
    await reportEnd(ctx, doc);
  }
}

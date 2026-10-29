import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import type { ProcessDoc } from '../schemas/records.ts';
import { appendBackground, appendEnding, backgroundText } from '../turns/background.ts';
import { plainText } from '../result-text.ts';
import { records } from '../store/collections.ts';
import { deleteServedArtifacts, deletedArtifactsText } from '../artifacts/served-artifacts.ts';
import { processName } from './process-records.ts';
import { lastLines, outputLines } from './process-text.ts';

// Telling a session how a background process ended (ADR 0009, 150): one background message with the outcome and the
// last 20 lines of output. It starts a turn only for a notify line, from its watcher; a handler's jobs carry the
// `fromHandler` mark and start none.

const reportLines = 20;

/** A process's last lines of output; none when it left no log. */
export async function outputTail(ctx: Ctx, id: string, lines: number): Promise<string> {
  try {
    return plainText(lastLines(await ctx.processes.log(processName(id), { tail: lines }), lines));
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

/** Deletes the url artifacts an ended process served (ADR 0104); one still in its startup second served none. */
export async function deleteEndedArtifacts(ctx: Ctx, doc: Stored<ProcessDoc>): Promise<string[]> {
  if (doc.starting === true) return [];
  return deleteServedArtifacts(ctx, doc.sessionId, await outputTail(ctx, doc.id, outputLines));
}

/** Tells the chat how `doc` ended; `startTurn` only for a notify line's watcher, which is no handler's job (ADR 0108, 16). */
export async function reportEnd(ctx: Ctx, doc: Stored<ProcessDoc>, deleted: readonly string[], startTurn = false): Promise<void> {
  const tail = await outputTail(ctx, doc.id, reportLines);
  const artifacts = deletedArtifactsText(deleted);
  const text = `The process ${outcome(doc)}${artifacts === '' ? '' : `\n${artifacts}`}${tail === '' ? '' : `\nIts last output:\n${tail}`}`;
  await appendEnding(ctx, doc.sessionId, { kind: 'job', jobId: doc.id }, backgroundText(doc.call, doc.id, text), startTurn);
}

type Ended = { doc: Stored<ProcessDoc>; deleted: readonly string[] };

/** The message that reports the runs that ended while kvman was stopped: one line per run, with no output (ADR 0085, 5). */
function interruptedText(ended: readonly Ended[]): string {
  const line = ({ doc, deleted }: Ended): string => [`- \`${doc.call}\` (job ${doc.id}): ${outcome(doc).replace(/^was /, '')}`, deletedArtifactsText(deleted)].filter((part) => part !== '').join(' ');
  return ['While kvman was stopped, these background calls ended:', ...ended.map(line)].join('\n');
}

/** Reports the endings no handler could write into this session (kvman stopped or died), once, in one message. */
export async function reportInterrupted(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  // A notify line's exit is its watcher's to report (ADR 0108, 16).
  const ended = (await store.processes.find({ sessionId, reported: false }, { limit: 1000 })).filter((doc) => doc.end !== undefined && !(doc.notify === true && doc.end === 'exited'));
  if (ended.length === 0) return;
  const told: Ended[] = [];
  for (const doc of ended) {
    await store.processes.update(doc.id, { reported: true });
    told.push({ doc, deleted: await deleteEndedArtifacts(ctx, doc) });
  }
  // The message's source names the first run; the text names them all.
  await appendBackground(ctx, sessionId, { kind: 'job', jobId: ended[0]?.id ?? '' }, interruptedText(told), false);
}

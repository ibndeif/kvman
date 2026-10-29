import { z, type Ctx } from '@kvman/sdk';
import { delay } from '../delay.ts';
import { records, txRecords } from '../store/collections.ts';
import { deleteEndedArtifacts, reportEnd } from './process-report.ts';

// A background line started with `notify: true` (plan 08 §8.3, ADR 0108, 16): its end starts a turn when the chat is
// idle. A handler's jobs carry the `fromHandler` mark and may not start a turn, so the step that started the line also
// starts this watcher, which reports the end itself; the exit handler leaves such a line to it.

const lookEveryMs = 1_000;
/** A watcher runs for an hour at most, then hands over to a new one, so no job runs for ever. */
const watchForMs = 3_600_000;

const watchInput = z.object({ id: z.string().min(1) });

/** Starts the watcher of the notify line `id`. */
export async function watchNotified(ctx: Ctx, id: string): Promise<void> {
  await ctx.execAsync('kvcoder.background.notify.watch', { id });
}

// Claims the report of an exit by itself once, so the end is told only once.
async function claimReport(ctx: Ctx, id: string) {
  return ctx.store.transaction((tx) => {
    const doc = txRecords(tx).processes.get(id);
    if (doc?.end !== 'exited' || doc.reported) return undefined;
    return txRecords(tx).processes.update(id, { reported: true });
  });
}

export function registerNotifyWatch(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.background.notify.watch', {
    description: 'Waits for a background line started with notify to end, then tells its chat, starting a turn when the chat is idle.',
    input: watchInput,
    output: z.object({}),
    retries: 0,
    timeoutMs: watchForMs + 60_000,
    handle: async ({ id }) => {
      const until = Date.now() + watchForMs;
      for (;;) {
        const doc = await records(ctx.store).processes.get(id);
        if (doc === undefined || (doc.end !== undefined && doc.end !== 'exited')) return {};
        if (doc.end === 'exited') {
          const claimed = await claimReport(ctx, id);
          if (claimed !== undefined) await reportEnd(ctx, claimed, await deleteEndedArtifacts(ctx, claimed), true);
          return {};
        }
        if (Date.now() >= until) {
          await watchNotified(ctx, id);
          return {};
        }
        await delay(lookEveryMs, ctx.job.signal);
      }
    },
  });
}

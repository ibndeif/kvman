import { z, type Ctx } from '@kvman/sdk';
import { records } from '../store/collections.ts';
import { markEnd, ownerName, processId, processName } from './process-records.ts';
import { reportEnd } from './process-report.ts';

// How kvcoder learns that a background process ended without its own doing (ADR 0009, 150): `kernel.process.exited` for
// an exit by itself, `kernel.stopping` as kvman stops, and `kernel.started` for a kvman that died. The last two run in
// Home, so they only record the end; the chat is told at its next message (`reportInterrupted`).

const runningProcessesSchema = z.array(z.object({ extension: z.string(), name: z.string() }));

async function interrupt(ctx: Ctx, ids: readonly string[]): Promise<void> {
  for (const id of ids) await markEnd(ctx, id, { end: 'interrupted', reported: false });
}

async function runningIds(ctx: Ctx): Promise<string[]> {
  const docs = await records(ctx.store).processes.find({}, { limit: 1000 });
  return docs.filter((doc) => doc.end === undefined).map((doc) => doc.id);
}

/** Marks the records of processes that no longer run, such as after kvman died; a hot reload leaves running ones alone. */
export async function interruptLeftovers(ctx: Ctx): Promise<void> {
  const alive = new Set(runningProcessesSchema.parse(await ctx.exec('kernel.processes.list', {})).filter((process) => process.extension === ownerName).map((process) => process.name));
  await interrupt(ctx, (await runningIds(ctx)).filter((id) => !alive.has(processName(id))));
}

export function registerProcessHandlers(ctx: Ctx): void {
  ctx.registerHandler('kernel.process.exited', {
    description: 'Records how a background process of a chat exited by itself, and tells the chat.',
    handle: async ({ extension, name, exitCode, signal }) => {
      const id = processId(name);
      if (extension !== ownerName || id === undefined) return;
      const ended = await markEnd(ctx, id, { end: 'exited', exitCode, signal, reported: true });
      if (ended !== undefined) await reportEnd(ctx, ended);
    },
  });
  ctx.registerHandler('kernel.stopping', {
    description: 'Marks the background processes of chats interrupted, as kvman stops them.',
    handle: async () => interrupt(ctx, await runningIds(ctx)),
  });
}

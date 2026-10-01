import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { ProblemError, z, type Ctx } from '@kvman/sdk';

// The preview's record in the workspace store, its home folder, and its cleanup (ADR 0009, 124–126). Its processes
// are `preview` and `web-<n>`.

export const previewRecordSchema = z.object({ url: z.string(), extensions: z.array(z.string()) });

export type PreviewRecord = z.infer<typeof previewRecordSchema>;

export const recordKey = 'preview';

export function previewHome(workspaceId: string): string {
  return path.join(tmpdir(), `kvman-preview-${workspaceId}`);
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

// A process that exits while it's being stopped has already gone; stopping it again fails NOT_FOUND.
async function stopIfRunning(ctx: Ctx, name: string): Promise<void> {
  try {
    await ctx.processes.stop(name);
  } catch (error) {
    if (!(error instanceof ProblemError && error.problem.code === 'NOT_FOUND')) throw error;
  }
}

/** Stops the `web:watch` processes (and the preview, when `withPreview`), removes the home, and forgets the record. */
export async function cleanUpPreview(ctx: Ctx, withPreview: boolean): Promise<void> {
  const running = await ctx.processes.list();
  for (const process of running) {
    if (process.name.startsWith('web-') || (withPreview && process.name === 'preview')) await stopIfRunning(ctx, process.name);
  }
  rmSync(previewHome(ctx.job.workspace.id), { recursive: true, force: true });
  await ctx.store.kv.delete(recordKey);
}

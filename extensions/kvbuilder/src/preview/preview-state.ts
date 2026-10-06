import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z, type Ctx } from '@kvman/sdk';

// The preview's record in the workspace store, its home folder, and its cleanup (plan 09 §9.3, ADR 0010, 21). The
// bin owns the preview kvman and its `web:watch` children; kvbuilder only removes the home the bin left behind
// (a Windows tree-kill skips the bin's own cleanup) and forgets the record.

export const previewRecordSchema = z.object({ url: z.string(), extensions: z.array(z.string()) });

export type PreviewRecord = z.infer<typeof previewRecordSchema>;

export const recordKey = 'preview';

export function previewHome(workspaceId: string): string {
  return path.join(tmpdir(), `kvman-preview-${workspaceId}`);
}

/** Removes the preview's home and forgets its record. */
export async function cleanUpPreview(ctx: Ctx): Promise<void> {
  rmSync(previewHome(ctx.job.workspace.id), { recursive: true, force: true });
  await ctx.store.kv.delete(recordKey);
}

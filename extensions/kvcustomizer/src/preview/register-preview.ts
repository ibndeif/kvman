import { z, type Ctx } from '@kvman/sdk';
import { jobOptions } from '../job-options.ts';
import { callPreview, previewAnswerSchema } from './preview-call.ts';
import { startPreview } from './preview-start.ts';
import { cleanUpPreview, previewRecordSchema, recordKey } from './preview-state.ts';

// The `preview` connector's commands (plan 09 §9.3): the preview itself, calls of its commands and queries (ADR 0022, 8),
// and the cleanup when the preview exits by itself.

const callSchema = z.object({
  name: z.string().min(1).describe('The full name of a public command or query of the preview, such as notes.item.list.'),
  input: z.record(z.string(), z.json()).optional().describe('Its input; {} when left out.'),
});

const queryTimeoutMs = 120_000;

const statusSchema = z.union([z.object({ running: z.literal(false) }), z.object({ running: z.literal(true), url: z.string(), extensions: z.array(z.string()), startedAt: z.string() })]);

export function registerPreview(ctx: Ctx): void {
  ctx.registerCommand('kvcustomizer.preview.start', {
    description: 'Starts a preview kvman with extension projects of the workspace, and gives its URL.',
    public: true,
    ...jobOptions['kvcustomizer.preview.start'],
    input: z.object({
      extensions: z.array(z.string().min(1)).min(1).describe('The project folders, relative to the workspace folder.'),
      preset: z.string().min(1).optional().describe('A preset file to add the projects to, relative to the workspace folder.'),
    }),
    output: z.object({ url: z.string() }),
    handle: (input) => startPreview(ctx, input),
  });
  ctx.registerCommand('kvcustomizer.preview.stop', {
    description: 'Stops the preview kvman and its component watchers.',
    public: true,
    ...jobOptions['kvcustomizer.preview.stop'],
    input: z.object({}),
    output: z.object({}),
    handle: async () => {
      await ctx.processes.stop('preview');
      await cleanUpPreview(ctx);
      return {};
    },
  });
  ctx.registerQuery('kvcustomizer.preview.status', {
    description: 'Tells whether the preview kvman runs, and its URL.',
    public: true,
    input: z.object({}),
    output: statusSchema,
    handle: async () => {
      const preview = (await ctx.processes.list()).find((process) => process.name === 'preview');
      const record = previewRecordSchema.safeParse(await ctx.store.kv.get(recordKey));
      if (preview === undefined || !record.success) return { running: false as const };
      return { running: true as const, url: record.data.url, extensions: record.data.extensions, startedAt: preview.startedAt };
    },
  });
  ctx.registerQuery('kvcustomizer.preview.query.get', {
    description: 'Runs one public query of the preview kvman and gives what it answered: its output, or its Problem.',
    public: true,
    timeoutMs: queryTimeoutMs,
    input: callSchema,
    output: previewAnswerSchema,
    handle: ({ name, input }) => callPreview(ctx, 'queries', name, input ?? {}),
  });
  ctx.registerCommand('kvcustomizer.preview.command.run', {
    description: 'Runs one public command of the preview kvman and gives what it answered: its output, or its Problem.',
    public: true,
    ...jobOptions['kvcustomizer.preview.command.run'],
    input: callSchema,
    output: previewAnswerSchema,
    handle: ({ name, input }) => callPreview(ctx, 'commands', name, input ?? {}),
  });
  ctx.registerHandler('kernel.process.exited', {
    description: 'Stops the component watchers and removes the home of a preview that exited by itself.',
    handle: async (exited) => {
      if (exited.extension === '@kvman/kvcustomizer' && exited.name === 'preview') await cleanUpPreview(ctx);
    },
  });
}

import { defineExtension, z } from '@kvman/sdk';

// The pdf example of plan 05 §5.2 with its non-UI calls. Its handlers use only the ctx built so far (store, step);
// ctx.problem comes with M1.6, so a missing file throws a plain error here.
const File = z.object({
  id: z.string(), name: z.string(), blobId: z.blobId(),
  status: z.enum(['importing', 'ready', 'translating', 'translated', 'failed']),
  pages: z.number().int().optional(), translatedBlobId: z.blobId().optional(),
  createdAt: z.number(),
});

export const exampleBlobId = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

export const pdfExtension = defineExtension({
  name: '@acme/pdf',
  namespace: 'pdf',
  title: '$t.meta.title',
  summary: '$t.meta.summary',
  icon: 'file-text',
  description: 'Import PDF files and translate them with the configured AI model.',
}, (ext) => {
  ext.requestCapability('llm', { reason: '$t.reasons.llm' });
  ext.requestCapability('ui', { reason: '$t.reasons.ui' });

  const files = ext.registerCollection('files', {
    description: 'Imported PDF files.', schema: File, indexes: [['status', 'createdAt']],
  });
  ext.registerEntity('pdf.file', {
    description: 'An imported PDF file.', title: '$t.entities.file', schema: File, idField: 'id',
    display: { title: '$item.name', subtitle: '$item.status', icon: 'file-text' },
    route: '/files/{{ $item.id }}',
  });
  ext.registerConfig({
    scope: 'workspace',
    schema: z.object({
      defaultLanguage: z.string().default('ar').describe('Target language code')
        .meta({ label: '$t.settings.defaultLanguage' }),
    }),
  });

  ext.registerError('pdf/NOT_FOUND', { description: 'The file id does not exist in this workspace.', title: 'No such file' });

  ext.registerEvent('pdf.imported', { description: 'A PDF was imported.', payload: z.object({ fileId: z.string() }) });
  ext.registerEvent('pdf.translated', {
    description: 'A translation finished.', payload: z.object({ fileId: z.string(), blobId: z.blobId() }),
  });
  ext.registerEvent('pdf.progress.updated', {
    description: 'Translation text for one file, as it is generated.', delivery: 'live', chunk: 'text',
  });

  ext.registerCommand('pdf.import', {
    description: 'Import an uploaded PDF blob.',
    input: z.object({ blobId: z.blobId() }), output: z.object({ fileId: z.string() }),
    lane: 'blob:{{ $payload.blobId }}',
    examples: [{ blobId: exampleBlobId }],
    async handle({ blobId }, ctx) {
      const pages = await ctx.step('inspect', async () => 1);
      ctx.store.collection(files).put({ id: blobId, name: `${blobId}.pdf`, blobId, status: 'ready', pages, createdAt: 0 });
      return { fileId: blobId };
    },
  });

  ext.registerCommand('pdf.translate', {
    description: 'Translate a PDF to a target language.',
    input: z.object({ fileId: z.string(), lang: z.string().describe('Target language code') }),
    output: z.object({ blobId: z.blobId() }),
    lane: 'file:{{ $payload.fileId }}',
    concurrency: 2, timeoutMs: 300_000,
    agentTool: { title: 'Translate PDF' },
    async handle({ fileId }, ctx) {
      const file = await ctx.store.collection(files).patch(fileId, { status: 'translated' });
      return { blobId: file.blobId };
    },
  });

  ext.registerCommand('pdf.files.prune', {
    description: 'Delete failed imports older than 30 days.', access: 'internal',
    input: z.object({}),
    async handle(_, ctx) {
      for (const file of await ctx.store.collection(files).find({ where: { status: 'failed' } })) ctx.store.collection(files).delete(file.id);
    },
  });
  ext.registerSchedule('prune', { description: 'Hourly cleanup.', every: '1h', command: 'pdf.files.prune' });

  ext.registerQuery('pdf.files.list', {
    description: 'List imported files, newest first.',
    input: z.object({ status: File.shape.status.optional() }),
    output: z.object({ items: z.array(File) }),
    handle: async ({ status }, ctx) => ({
      items: await ctx.store.collection(files).find({ where: status ? { status } : {}, orderBy: [['createdAt', 'desc']] }),
    }),
  });
  ext.registerQuery('pdf.files.count', {
    description: 'Count files, optionally by status.',
    input: z.object({ status: File.shape.status.optional() }), output: z.object({ count: z.number().int() }),
    handle: async ({ status }, ctx) => ({ count: await ctx.store.collection(files).count({ where: status ? { status } : {} }) }),
  });
  ext.registerQuery('pdf.file.get', {
    description: 'Get one file by id.',
    input: z.object({ fileId: z.string() }), output: File,
    handle: async ({ fileId }, ctx) => {
      const file = await ctx.store.collection(files).get(fileId);
      if (file === undefined) throw new Error(`no file ${fileId}`);
      return file;
    },
  });
});

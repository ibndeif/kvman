import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileSchema } from '@kvman/sdk';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const writer = {
  name: '@test/f',
  namespace: 'f',
  entry: entry(`
  const byId = z.object({ id: z.string() });
  ctx.registerCommand('f.write', { description: 'Writes a file.', input: z.object({ name: z.string(), text: z.string() }), output: z.unknown(), public: true,
    handle: (input) => ctx.files.write(input.name, new TextEncoder().encode(input.text), 'text/plain') });
  ctx.registerQuery('f.get', { description: 'Gets a file.', input: byId, output: z.unknown(), public: true, handle: (input) => ctx.files.get(input.id) });
  ctx.registerQuery('f.read', { description: 'Reads a file.', input: byId, output: z.string(), public: true, handle: async (input) => (await ctx.files.read(input.id)).toString('utf8') });
  ctx.registerQuery('f.path', { description: 'Locates a file.', input: byId, output: z.string(), public: true, handle: (input) => ctx.files.path(input.id) });
  ctx.registerCommand('f.unlink', { description: 'Unlinks a file.', input: byId, output: z.object({}), public: true, handle: async (input) => { await ctx.files.unlink(input.id); return {}; } });
  ctx.registerQuery('f.write-in-query', { description: 'Writes from a query.', input: z.object({}), output: z.unknown(), public: true,
    handle: () => ctx.files.write('q.txt', 'x', 'text/plain') });`),
};
const stranger = {
  name: '@test/g',
  namespace: 'g',
  entry: entry(`
  ctx.registerCommand('g.unlink', { description: 'Unlinks a file.', input: z.object({ id: z.string() }), output: z.object({}), public: true,
    handle: async (input) => { await ctx.files.unlink(input.id); return {}; } });`),
};

const problem = (code: string) => ({ problem: { code } });

async function start() {
  const kernel = await harness.start([writer, stranger]);
  const file = fileSchema.parse(await kernel.exec('f.write', { name: 'note.txt', text: 'hello' }));
  return { kernel, file };
}

describe('files (02 §2.7)', () => {
  it('M1.6-E10 ctx.files writes a file owned by the extension, and reads it back by id and by path', async () => {
    const { kernel, file } = await start();
    expect(file).toMatchObject({ name: 'note.txt', type: 'text/plain', size: 5, owner: { kind: 'extension', name: '@test/f' }, workspaceId: 'home' });
    expect(await kernel.exec('f.get', { id: file.id })).toEqual(file);
    expect(await kernel.exec('f.read', { id: file.id })).toBe('hello');
    expect(await kernel.exec('f.path', { id: file.id })).toBe(path.join(kernel.home, 'files', file.id));
  });

  it('M1.6-E11 a file of another workspace is NOT_FOUND to ctx.files', async () => {
    const { kernel, file } = await start();
    const workspace = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    for (const name of ['f.get', 'f.read', 'f.path', 'f.unlink']) {
      await expect(kernel.exec(name, { id: file.id }, { workspaceId: workspace.id })).rejects.toMatchObject(problem('NOT_FOUND'));
    }
  });

  it('M1.6-E12 only the owner unlinks an extension\'s file', async () => {
    const { kernel, file } = await start();
    await expect(kernel.exec('g.unlink', { id: file.id })).rejects.toMatchObject(problem('NOT_PUBLIC'));
    await expect(kernel.exec('kernel.files.unlink', { id: file.id })).rejects.toMatchObject(problem('NOT_PUBLIC'));
    await kernel.exec('f.unlink', { id: file.id });
    await expect(kernel.exec('kernel.files.get', { id: file.id })).rejects.toMatchObject(problem('NOT_FOUND'));
  });

  it('M1.6-E14 a query cannot write a file, and a list limit over 1000 is invalid', async () => {
    const { kernel } = await start();
    await expect(kernel.exec('f.write-in-query', {})).rejects.toMatchObject(problem('READ_ONLY'));
    await expect(kernel.exec('kernel.files.list', { limit: 1001 })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });
});

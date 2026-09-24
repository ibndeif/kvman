import { z, type Collection, type CollectionRef, type Ctx, type Log, type LogRef } from '@kvman/sdk';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { record } from './harness.ts';

const File = z.object({ id: z.string(), pages: z.number().optional() });
type File = z.infer<typeof File>;

describe('typed references (ADR 0044)', () => {
  it('M1.3-E11 each reference is its registered name, typed for the store', () => {
    const references: string[] = [];
    let files: CollectionRef<'files', File> | undefined;
    let history: LogRef<'history:*', string> | undefined;
    record((ext) => {
      references.push(ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({}), handle: async () => null }));
      references.push(ext.registerQuery('pdf.runs.list', { description: 'Lists.', input: z.object({}), output: z.object({}), handle: async () => ({}) }));
      references.push(ext.registerEvent('pdf.ran', { description: 'Ran.' }));
      files = ext.registerCollection('files', { description: 'Files.', schema: File });
      history = ext.registerLog('history:*', { description: 'History.', entry: z.string() });
      references.push(files, history);
      references.push(ext.registerEntity('pdf.file', { description: 'A file.', title: 'File', schema: File, display: { title: '$item.id' } }));
      references.push(ext.registerError('pdf/NOT_FOUND', { description: 'Missing.', title: 'Missing' }));
      references.push(ext.registerSchedule('prune', { description: 'Prunes.', every: '1h', command: 'pdf.run' }));
    });
    const names = ['pdf.run', 'pdf.runs.list', 'pdf.ran', 'files', 'history:*', 'pdf.file', 'pdf/NOT_FOUND', 'prune'];
    expect(references).toEqual([...names, ...names]);
    expectTypeOf((ctx: Ctx, reference: CollectionRef<'files', File>) => ctx.store.collection(reference)).returns.toEqualTypeOf<Collection<File>>();
    expectTypeOf((ctx: Ctx, reference: LogRef<'history:*', string>) => ctx.store.log(reference, 'abc')).returns.toEqualTypeOf<Log<string>>();
    expectTypeOf(files).toEqualTypeOf<CollectionRef<'files', File> | undefined>();
    expectTypeOf(history).toEqualTypeOf<LogRef<'history:*', string> | undefined>();
  });
});

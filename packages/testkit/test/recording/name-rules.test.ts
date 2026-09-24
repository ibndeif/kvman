import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { issuePaths, record, recordingProblem } from './harness.ts';

const input = z.object({});
const handle = async (): Promise<null> => null;
const reason = 'Needed.';

describe('names and name sets (plan 05 §5.3, ADR 0042)', () => {
  it('M1.3-H4 a duplicate name in one name set fails', () => {
    const problem = recordingProblem((ext) => {
      ext.registerCommand('pdf.imported', { description: 'Imports.', input, handle });
      ext.registerEvent('pdf.imported', { description: 'Imported.' });
    });
    expect(problem).toMatchObject({ code: 'EXT_MANIFEST_INVALID', issues: [{ path: 'types.1.type', message: '"pdf.imported" is already registered as a command' }] });
  });

  it('M1.3-H5 a short public name fails with the full name as hint', () => {
    const problem = recordingProblem((ext) => {
      ext.registerCommand('translate', { description: 'Translates.', input, handle });
    });
    expect(problem.issues).toEqual([
      { path: 'types.0.type', message: 'public names start with the namespace "pdf."', hint: 'did you mean "pdf.translate"?' },
    ]);
  });

  it('M1.3-E8 entities, types, and error codes carry the namespace; foreign references are fine', () => {
    const problem = recordingProblem((ext) => {
      ext.registerEvent('other.done', { description: 'Done.' });
      ext.registerEntity('file', { description: 'A file.', title: 'File', schema: input, display: { title: '$item.id' } });
      ext.registerError('NOT_FOUND', { description: 'Missing.', title: 'Missing' });
    });
    expect(problem.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'types.0.type', hint: 'did you mean "pdf.other.done"?' }),
      expect.objectContaining({ path: 'entities.0.name', hint: 'did you mean "pdf.file"?' }),
      expect.objectContaining({ path: 'errors.0.code', hint: 'did you mean "pdf/NOT_FOUND"?' }),
    ]));
    expect(issuePaths(problem).sort()).toEqual(['entities.0.name', 'errors.0.code', 'types.0.type']);
    expect(() => record((ext) => {
      ext.subscribe('agent.session.deleted', { description: 'Cleans up.', handle: async () => undefined });
      ext.requireTypes(['fs.file.get'], { reason });
    })).not.toThrow();
  });

  it('M1.3-E9 each name set and each once-only call rejects a second entry', () => {
    const schema = z.object({ id: z.string() });
    const problem = recordingProblem((ext) => {
      for (let copy = 0; copy < 2; copy += 1) {
        ext.registerEntity('pdf.file', { description: 'A file.', title: 'File', schema, display: { title: '$item.id' } });
        ext.registerCollection('files', { description: 'Files.', schema });
        ext.registerLog('history:*', { description: 'History.', entry: z.string() });
        ext.registerSchedule('prune', { description: 'Prunes.', every: '1h', command: 'pdf.files.prune' });
        ext.registerError('pdf/NOT_FOUND', { description: 'Missing.', title: 'Missing' });
        ext.subscribe('pdf.imported', { description: 'Reacts.', handle: async () => undefined });
        ext.requestCapability('ui', { reason });
        ext.registerConfig({ scope: 'global', schema: z.object({}) });
        ext.registerDataVersion(1);
        ext.requestIsolation('dedicated', { reason });
      }
      ext.registerCommand('pdf.files.prune', { description: 'Prunes.', input, access: 'internal', handle });
    });
    expect(issuePaths(problem).sort()).toEqual([
      'config', 'data.collections.1.name', 'data.logs.1.prefix', 'data.version', 'entities.1.name', 'errors.1.code',
      'permissions.capabilities.1.name', 'permissions.isolation', 'schedules.1.name', 'subscriptions.1.event',
    ]);
    expect(problem.issues).toEqual(expect.arrayContaining([
      { path: 'data.collections.1.name', message: '"files" is already registered' },
      { path: 'config', message: 'registerConfig is already called; it is called at most once' },
    ]));
  });

  it('M1.3-E10 private names are plain, and log families end in :*', () => {
    const schema = z.object({ id: z.string() });
    const problem = recordingProblem((ext) => {
      ext.registerCollection('Files', { description: 'Files.', schema });
      ext.registerLog('history:*:x', { description: 'Bad family.', entry: z.string() });
    });
    expect(issuePaths(problem).sort()).toEqual(['data.collections.0.name', 'data.logs.0.prefix']);
    const { manifest } = record((ext) => {
      ext.registerCollection('files', { description: 'Files.', schema });
      ext.registerCollection('childRuns', { description: 'Child runs.', schema });
      ext.registerLog('history:*', { description: 'History.', entry: z.string() });
    });
    expect(manifest.data.collections.map((collection) => collection.name)).toEqual(['files', 'childRuns']);
    expect(manifest.data.logs.map((log) => log.prefix)).toEqual(['history:*']);
  });
});

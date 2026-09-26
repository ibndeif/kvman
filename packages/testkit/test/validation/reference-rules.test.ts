import { ProblemError, recordExtension } from '@kvman/kernel';
import type { Problem } from '@kvman/protocol';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { correlationId, errorsOf, reason, recordedIssues, warningsOf } from './harness.ts';

const handle = async (): Promise<null> => null;
const input = z.object({});

function setupProblem(setup: (ext: Ext) => void): Problem {
  const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'A test extension.' }, setup);
  try {
    recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId });
  } catch (error) {
    if (error instanceof ProblemError) return error.problem;
    throw error;
  }
  throw new Error('the recording was expected to fail');
}

describe('capabilities, access, and names (plan 02 §2.4, 06 §6.3, ADRs 0107, 0108)', () => {
  it('M2.1-E17 required types that are own, kernel, called, or subscribed are covered', () => {
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.run', { description: 'Runs.', input, handle });
      ext.requestCapability('calls', { reason, types: ['todo.add', 'fs.*'] });
      ext.subscribe('agent.session.deleted', { description: 'Cleans up.', handle: async () => undefined });
      ext.subscribe('notes.*', { description: 'Watches notes.', handle: async () => undefined });
      ext.requireTypes(['pdf.run', 'kernel.cancel', 'todo.add', 'fs.file.get', 'agent.session.deleted', 'notes.note.added'], { reason });
    });
    expect(errorsOf(issues)).toEqual([]);
  });

  it('M2.1-E18 slash needs access all or user, and an agent tool all or extensions', () => {
    const slash = { name: 'run', description: 'Run' };
    const allowed = recordedIssues((ext) => {
      ext.registerCommand('pdf.run', { description: 'Runs.', input, access: 'all', slash, handle });
      ext.registerCommand('pdf.answer', { description: 'Answers.', input, access: 'user', slash: { name: 'answer', description: 'Answer' }, handle });
      ext.registerCommand('pdf.convert', { description: 'Converts.', input, access: 'all', agentTool: { title: 'Convert' }, handle });
      ext.registerQuery('pdf.files.list', { description: 'Lists.', input, output: input, access: 'extensions', agentTool: { title: 'List' }, handle: async () => ({}) });
    });
    expect(errorsOf(allowed)).toEqual([]);
    const refused = recordedIssues((ext) => {
      ext.registerCommand('pdf.record', { description: 'Records.', input, access: 'internal', slash, handle });
      ext.registerCommand('pdf.expire', { description: 'Expires.', input, access: 'internal', agentTool: { title: 'Expire' }, handle });
    });
    expect(errorsOf(refused).map((issue) => issue.path)).toEqual(['types.0.slash', 'types.1.agentTool']);
  });

  it('M2.1-E19 grammar findings are warnings with the checker\'s hints', () => {
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.translated', { description: 'Translates.', input, handle });
      ext.registerQuery('pdf.files', { description: 'Lists.', input, output: input, handle: async () => ({}) });
      ext.registerEvent('pdf.translate', { description: 'Translated.' });
      ext.registerCommand('pdf.files.get', { description: 'Gets.', input, handle });
    });
    expect(errorsOf(issues)).toEqual([]);
    expect(warningsOf(issues)).toEqual([
      { path: 'types.0.type', message: 'command names end in an imperative verb', hint: 'did you mean "pdf.translate"?', severity: 'warning' },
      { path: 'types.1.type', message: 'query names end in a read verb (get, list, search, count, preview, validate)', hint: 'rename "pdf.files" to end in one of them', severity: 'warning' },
      { path: 'types.2.type', message: 'event names end in a past participle', hint: 'did you mean "pdf.translated"?', severity: 'warning' },
      { path: 'types.3.type', message: 'command names end in an imperative verb, never a read verb', hint: 'a command that only reads is a query', severity: 'warning' },
    ]);
  });

  it('M2.1-E20 a naming exception reports the finding as excepted, and a well-named type gets nothing', () => {
    const issues = recordedIssues((ext) => {
      ext.registerEvent('pdf.translate', { description: 'Translated.', namingException: 'kept for the v1 API' });
      ext.registerCommand('pdf.import', { description: 'Imports.', input, namingException: 'not needed', handle });
    });
    expect(issues).toEqual([{ path: 'types.0.type', message: 'excepted: kept for the v1 API', hint: 'did you mean "pdf.translated"?', severity: 'warning' }]);
  });

  it('M2.1-E21 a format finding is an error, never a warning', () => {
    const issues = recordedIssues((ext) => ext.registerCommand('pdf.Files.add', { description: 'Adds.', input, handle }));
    expect(warningsOf(issues)).toEqual([]);
    expect(errorsOf(issues)).toEqual([expect.objectContaining({ path: 'types.0.type', message: 'the segment "Files" is not lowercase kebab-case' })]);
  });

  it('M2.1-E22 setup misuse carries a hint', () => {
    let kept: Ext | undefined;
    recordedIssues((ext) => {
      kept = ext;
    });
    let closed: unknown;
    try {
      kept?.registerError('pdf/LATE', { description: 'Late.', title: 'Late' });
    } catch (error) {
      closed = error;
    }
    expect(closed).toBeInstanceOf(ProblemError);
    expect(closed instanceof ProblemError ? closed.problem : undefined).toMatchObject({ detail: 'ext is closed after setup returns', hint: 'keep ext inside setup' });
    expect(setupProblem(async () => undefined)).toMatchObject({ detail: 'setup is synchronous', hint: 'make setup a plain function; register everything before it returns' });
    expect(setupProblem(() => {
      throw new Error('boom');
    })).toMatchObject({ detail: 'setup threw: boom', hint: 'setup only registers; fix the error it throws' });
  });
});

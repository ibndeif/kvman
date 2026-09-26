import { canonicalJson, jsonSchema } from '@kvman/protocol';
import { ProblemError, recordExtension } from '@kvman/kernel';
import { z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { correlationId, issuePaths, record, recordingProblem } from './harness.ts';
import { pdfExtension as pdf } from './pdf-extension.ts';

const input = z.object({});

describe('setup rules (plan 05 §5.1, ADR 0042)', () => {
  it('M1.3-H2 a second recording is compared for determinism', () => {
    let run = 0;
    const problem = recordingProblem((ext) => {
      run += 1;
      ext.registerCommand('pdf.run', { description: `Run number ${run}.`, input, handle: async () => null });
    });
    expect(problem).toMatchObject({ code: 'EXT_MANIFEST_INVALID', correlationId });
    expect(problem.issues).toEqual([{
      path: 'types.0.description', message: 'setup recorded something different on its second run; setup must be deterministic',
      hint: 'register the same things on every run; setup reads no clock, random numbers, or state',
    }]);
    const options = { packageName: '@acme/pdf', version: '1.2.0', correlationId };
    const canonicalManifest = () => canonicalJson(jsonSchema.parse(recordExtension(pdf, options).manifest));
    expect(canonicalManifest()).toBe(canonicalManifest());
  });

  it('M1.3-H3 calling ext after setup throws', () => {
    let kept: Ext | undefined;
    record((ext) => {
      kept = ext;
    });
    const call = () => kept?.registerCommand('pdf.late', { description: 'Too late.', input, handle: async () => null });
    expect(call).toThrow(ProblemError);
    expect(call).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'EXT_MANIFEST_INVALID', detail: 'ext is closed after setup returns' }) }));
  });

  it('M1.3-E1 an async setup and a throwing setup fail', () => {
    const asyncSetup = async (ext: Ext): Promise<void> => {
      ext.requestCapability('ui', { reason: 'Shows notices.' });
    };
    expect(recordingProblem(asyncSetup)).toMatchObject({ code: 'EXT_MANIFEST_INVALID', detail: 'setup is synchronous' });
    expect(recordingProblem(() => {
      throw new Error('boom');
    })).toMatchObject({ code: 'EXT_MANIFEST_INVALID', detail: 'setup threw: boom' });
  });

  it('M1.3-E2 every mistake is reported in one problem', () => {
    const problem = recordingProblem((ext) => {
      ext.registerCommand('pdf.run', { description: ' ', input, handle: async () => null });
      ext.registerEntity('file', { description: 'A file.', title: 'File', schema: input, display: { title: '$item.id' } });
      ext.registerCollection('Files', { description: 'Files.', schema: input });
    });
    expect(problem.code).toBe('EXT_MANIFEST_INVALID');
    expect(issuePaths(problem).sort()).toEqual(['data.collections.0.name', 'entities.0.name', 'types.0.description']);
  });
});

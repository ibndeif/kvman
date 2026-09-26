import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;
const losslessHint = 'keep schemas to what JSON Schema expresses; convert values in the handler instead';

describe('lossless schemas and descriptions (plan 06 §6.3, ADRs 0047, 0106)', () => {
  it('M2.1-E7 pipes, preprocess, codecs, custom types, dates, and transforms fail at their schema path', () => {
    const inputs = [
      z.object({ a: z.string().pipe(z.string().min(1)) }),
      z.object({ a: z.preprocess((value) => value, z.string()) }),
      z.object({ a: z.codec(z.string(), z.number(), { decode: Number, encode: String }) }),
      z.object({ a: z.custom<string>((value) => typeof value === 'string') }),
      z.object({ a: z.date() }),
    ];
    for (const input of inputs) {
      expect(errorsOf(recordedIssues((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input, handle })))).toEqual([
        { path: 'types.0.input', message: expect.stringContaining('the schema cannot be written as JSON Schema'), hint: losslessHint },
      ]);
    }
    const output = z.object({ size: z.string().transform((value) => value.length) });
    expect(errorsOf(recordedIssues((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input: z.object({}), output, handle: async () => ({ size: 'large' }) })))).toEqual([
      expect.objectContaining({ path: 'types.0.output', hint: losslessHint }),
    ]);
    const schema = z.object({ id: z.string().pipe(z.string()) });
    expect(errorsOf(recordedIssues((ext) => ext.registerCollection('files', { description: 'Files.', schema })))).toEqual([
      expect.objectContaining({ path: 'data.collections.0.schema', hint: losslessHint }),
    ]);
  });

  it('M2.1-E8 refinements and defaults are allowed', () => {
    const input = z.object({
      text: z.string().refine((text) => text !== 'no'),
      pair: z.object({ low: z.number(), high: z.number() }).superRefine(() => undefined),
      tags: z.array(z.string()).default([]),
    });
    expect(errorsOf(recordedIssues((ext) => ext.registerCommand('pdf.run', { description: 'Runs.', input, handle })))).toEqual([]);
  });

  it('M2.1-E9 every config field needs a description, nested and in array items', () => {
    const undescribed = z.object({
      limits: z.object({ max: z.number() }).describe('Limits.'),
      rules: z.array(z.object({ name: z.string() })).describe('Rules.'),
      label: z.string().describe('   '),
    });
    const issues = errorsOf(recordedIssues((ext) => ext.registerConfig({ scope: 'workspace', schema: undescribed })));
    expect(issues.map((issue) => issue.path)).toEqual([
      'config.schema.properties.limits.properties.max', 'config.schema.properties.rules.items.properties.name', 'config.schema.properties.label',
    ]);
    const described = z.object({
      limits: z.object({ max: z.number().describe('The maximum.') }).describe('Limits.'),
      rules: z.array(z.object({ name: z.string().describe('Its name.') })).describe('Rules.'),
      note: z.string().describe('A note.').nullable(),
    });
    expect(errorsOf(recordedIssues((ext) => ext.registerConfig({ scope: 'workspace', schema: described })))).toEqual([]);
  });

  it('M2.1-E10 other schemas need no field descriptions', () => {
    const file = z.object({ id: z.string(), name: z.string() });
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.import', { description: 'Imports.', input: z.object({ blobId: z.string() }), output: z.object({ fileId: z.string() }), handle: async () => ({ fileId: 'f' }) });
      ext.registerCollection('files', { description: 'Files.', schema: file });
      ext.registerEntity('pdf.file', { description: 'A file.', title: 'File', schema: file, display: { title: '$item.name' } });
    });
    expect(errorsOf(issues)).toEqual([]);
  });
});

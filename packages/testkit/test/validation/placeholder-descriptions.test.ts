import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { recordedIssues, validatedIssues, warningsOf } from './harness.ts';

const hint = 'describe in a sentence what it is for';

describe('placeholder descriptions (14 §14.5, ADR 0169)', () => {
  it('M2.13-E24 a placeholder description is a warning at its path, at recording and in kernel.validate', () => {
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.one', { description: 'todo', input: z.object({}), handle: async () => ({}) });
      ext.registerCommand('pdf.two', { description: ' TBD ', input: z.object({}), handle: async () => ({}) });
      ext.registerCommand('pdf.three', { description: '…', input: z.object({}), handle: async () => ({}) });
      ext.registerCommand('pdf.four', { description: 'Lorem ipsum dolor', input: z.object({}), handle: async () => ({}) });
      ext.registerCommand('pdf.run', { description: 'pdf.run', input: z.object({}), handle: async () => ({}) });
      ext.registerCommand('pdf.five', {
        description: 'Translates one file into the chosen language.',
        input: z.object({ fileId: z.string().describe('placeholder'), lang: z.string().describe('The language to translate into.') }),
        handle: async () => ({}),
      });
    });
    const placeholders = warningsOf(issues).filter((issue) => issue.code === 'PLACEHOLDER_DESCRIPTION');
    expect(placeholders.map((issue) => issue.path)).toEqual([
      'types.0.description', 'types.1.description', 'types.2.description', 'types.3.description', 'types.4.description',
      'types.5.input.properties.fileId.description',
    ]);
    expect(placeholders.every((issue) => issue.hint === hint)).toBe(true);
    expect(issues.filter((issue) => issue.severity !== 'warning')).toEqual([]);

    const manifest = { meta: { name: '@acme/pdf', description: 'xxx' } };
    const validated = validatedIssues(manifest).filter((issue) => issue.code === 'PLACEHOLDER_DESCRIPTION');
    expect(validated).toEqual([{ path: 'meta.description', message: 'the description "xxx" is a placeholder', hint, code: 'PLACEHOLDER_DESCRIPTION', severity: 'warning' }]);
  });
});

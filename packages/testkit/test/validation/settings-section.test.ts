import { ProblemError, recordExtension } from '@kvman/kernel';
import { defineExtension, z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { correlationId, errorsOf, recordedIssues } from './harness.ts';

describe('settings section text dependency', () => {
  it('M2.11-E2 refuses a settings section without config and records it with config', () => {
    const section = (ext: Ext): void => {
      ext.registerSettingsSection({ description: 'Settings.', view: { type: 'stack' } });
    };
    const issues = errorsOf(recordedIssues(section));
    expect(issues).toEqual([expect.objectContaining({ path: 'ui.settingsSection', message: expect.stringContaining('nothing registers a config'), hint: expect.stringContaining('registerConfig') })]);
    const invalid = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'Test.' }, section);
    let failure: unknown;
    try { recordExtension(invalid, { packageName: '@acme/pdf', version: '1.0.0', correlationId }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ProblemError);
    if (!(failure instanceof ProblemError)) throw new Error('expected EXT_MANIFEST_INVALID');
    expect(failure.problem.code).toBe('EXT_MANIFEST_INVALID');
    const valid = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'Test.' }, (ext) => {
      ext.registerConfig({ scope: 'global', schema: z.object({ language: z.string().describe('Language.') }) });
      section(ext);
    });
    const recorded = recordExtension(valid, { packageName: '@acme/pdf', version: '1.0.0', correlationId });
    expect(recorded.manifest.ui.settingsSection).toMatchObject({ description: 'Settings.', view: { type: 'stack' } });
    expect(recorded.manifest.config).toMatchObject({ scope: 'global' });
  });
});

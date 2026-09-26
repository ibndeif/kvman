import { maxManifestBytes, ProblemError, recordExtension } from '@kvman/kernel';
import { canonicalJson } from '@kvman/protocol';
import { defineExtension, z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { correlationId, errorsOf, pdfManifest, reason, recordedIssues, setAt, validatedIssues, warningsOf } from './harness.ts';

const handle = async (): Promise<null> => null;

describe('manifest rules (plan 06 §6.3, ADR 0042)', () => {
  it('M2.1-E1 one validation reports mistakes in different sections together', () => {
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.translate', { description: 'Translates.', input: z.object({ fileId: z.string() }), lane: 'file:{{ $payload.file }}', handle });
      ext.requireTypes(['fs.file.get'], { reason });
      ext.registerConfig({ scope: 'workspace', schema: z.object({ language: z.string() }) });
    });
    expect(errorsOf(issues).map((issue) => issue.path).sort()).toEqual(['config.schema.properties.language', 'permissions.requireTypes.0.types.0', 'types.0.lane']);
  });

  it('M2.1-E2 every reserved namespace and an over-long namespace fail', () => {
    for (const namespace of ['ui', 'frame', 'sys', 'preset']) {
      expect(errorsOf(recordedIssues(() => undefined, { namespace }))).toEqual([expect.objectContaining({ path: 'meta.namespace', message: `the namespace "${namespace}" is reserved` })]);
    }
    const long = 'n'.repeat(33);
    expect(errorsOf(validatedIssues(pdfManifest((manifest) => setAt(manifest, ['meta', 'namespace'], long))))).toEqual([
      { path: 'meta.namespace', message: `"${long}" is not a namespace`, hint: 'use 2–32 lowercase letters, digits, and "-", e.g. "pdf"' },
    ]);
  });

  it('M2.1-E3 a rule issue replaces the schema issue at the same path', () => {
    const issues = validatedIssues(pdfManifest((manifest) => setAt(manifest, ['meta', 'namespace'], 'P')));
    expect(issues.filter((issue) => issue.path === 'meta.namespace')).toEqual([expect.objectContaining({ hint: expect.any(String) })]);
  });

  it('M2.1-E4 exactly 5 MB of canonical JSON passes the size rule; one byte more fails', () => {
    const sized = (bytes: number) => pdfManifest((manifest) => {
      setAt(manifest, ['types', 3, 'examples'], ['']);
      const padding = bytes - Buffer.byteLength(canonicalJson(manifest), 'utf8');
      setAt(manifest, ['types', 3, 'examples'], ['x'.repeat(padding)]);
    });
    const atLimit = sized(maxManifestBytes);
    expect(Buffer.byteLength(canonicalJson(atLimit), 'utf8')).toBe(maxManifestBytes);
    expect(validatedIssues(atLimit)).toEqual([]);
    expect(validatedIssues(sized(maxManifestBytes + 1))).toEqual([
      { path: '', message: `the manifest is ${maxManifestBytes + 1} bytes of canonical JSON; the limit is 5 MB`, hint: 'keep the manifest under 5 MB: shorten examples, views, and catalogs' },
    ]);
  });

  it('M2.1-E5 warnings alone leave a recording valid; a failing recording lists only errors', () => {
    const definition = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'A test extension.' }, (ext) => {
      ext.registerCommand('pdf.translated', { description: 'Translates.', input: z.object({}), handle });
    });
    const recording = recordExtension(definition, { packageName: '@acme/pdf', version: '1.0.0', correlationId });
    expect(recording.warnings).toEqual([expect.objectContaining({ path: 'types.0.type', severity: 'warning', hint: 'did you mean "pdf.translate"?' })]);
    const failing = defineExtension({ name: '@acme/pdf', namespace: 'pdf', title: 'Test', description: 'A test extension.' }, (ext) => {
      ext.registerCommand('pdf.translated', { description: 'Translates.', input: z.object({}), handle });
      ext.requireTypes(['fs.file.get'], { reason });
    });
    expect(() => recordExtension(failing, { packageName: '@acme/pdf', version: '1.0.0', correlationId })).toThrow(ProblemError);
    const issues = recordedIssues((ext) => {
      ext.registerCommand('pdf.translated', { description: 'Translates.', input: z.object({}), handle });
      ext.requireTypes(['fs.file.get'], { reason });
    });
    expect(warningsOf(issues)).toEqual([]);
    expect(issues.map((issue) => issue.path)).toEqual(['permissions.requireTypes.0.types.0']);
  });

  it('M2.1-E6 the pdf example is valid with no issues', () => {
    expect(validatedIssues(pdfManifest())).toEqual([]);
  });
});

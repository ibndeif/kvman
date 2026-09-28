import { manifestSchema, presetSchema } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import fixture from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };
import { registryRevision } from '../../src/ui-registry/registry-revision.ts';

describe('registry revision', () => {
  it('M2.11-E46 changes with workspace, applied revision, digest and quarantine, not extension order', () => {
    const pdf = manifestSchema.parse(fixture);
    const other = manifestSchema.parse({ ...fixture, meta: { ...fixture.meta, name: '@acme/other', namespace: 'other' } });
    const preset = presetSchema.parse({ presetVersion: 1, id: 'test', name: 'Test', revision: 1, app: { title: 'Test', home: '/' }, extensions: {} });
    const first = { manifest: pdf, digest: 'a'.repeat(64), quarantined: false };
    const second = { manifest: other, digest: 'b'.repeat(64), quarantined: false };
    const sources = { workspaceId: 'a'.repeat(64), preset, presetRevision: 1, enabled: [first, second] };
    const baseline = registryRevision(sources);
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    expect(registryRevision({ ...sources, enabled: [second, first] })).toBe(baseline);
    expect(registryRevision({ ...sources, workspaceId: 'b'.repeat(64) })).not.toBe(baseline);
    expect(registryRevision({ ...sources, presetRevision: 2 })).not.toBe(baseline);
    expect(registryRevision({ ...sources, enabled: [{ ...first, digest: 'c'.repeat(64) }, second] })).not.toBe(baseline);
    expect(registryRevision({ ...sources, enabled: [first, { ...second, quarantined: true }] })).not.toBe(baseline);
  });
});

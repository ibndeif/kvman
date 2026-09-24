import { describe, expect, it } from 'vitest';
import { capabilitiesSchema, presetSchema, sourceSchema } from '../src/index.ts';
import { copyOf, expectRoundTrip, issuePaths } from './assertions.ts';
import kioskPresetFixture from './fixtures/kiosk-preset.json' with { type: 'json' };

const commit = 'a'.repeat(40);
const digest = 'b'.repeat(64);

const fullGrant = {
  isolation: 'sandboxed',
  requested: [
    { name: 'calls', types: ['fs.file.get', 'todo.*'] }, { name: 'tools' }, { name: 'llm' }, { name: 'ui' },
    { name: 'files.read' }, { name: 'files.write' }, { name: 'process' }, { name: 'network' }, { name: 'kernel.admin' },
  ],
  derived: { subscribes: ['agent.session.deleted', 'pdf.*'], providesLlm: ['ollama'] },
};

function presetWithPdfEntry(entry: Record<string, unknown>): unknown {
  const preset = copyOf(kioskPresetFixture) as { extensions: Record<string, unknown> };
  preset.extensions['@acme/pdf'] = { enabled: true, grants: fullGrant, ...entry };
  return preset;
}

describe('capabilities and sources (plan 05 §5.7, 06 §6.1, ADR 0019)', () => {
  it('M0.3-E11 the Capabilities grant shape', () => {
    expectRoundTrip(capabilitiesSchema, fullGrant);
    expect(issuePaths(capabilitiesSchema, { ...fullGrant, requested: [{ name: 'calls' }] })).toEqual(['requested.0']);
    expect(issuePaths(capabilitiesSchema, { ...fullGrant, isolation: 'none' })).toEqual(['isolation']);
  });

  it('M0.3-E12 every source form is accepted', () => {
    for (const source of ['npm:@acme/pdf@1.4.2', 'npm:pdf-lite@2.0.0-beta.1', `git:https://host/repo.git#${commit}`,
      `git:ssh://git@host/repo.git#${commit}`, 'builtin:@kvman/agent', 'dev:acme-pdf@3', `local:${digest}`]) {
      expect(sourceSchema.safeParse(source).success, source).toBe(true);
    }
  });

  it('M0.3-E13 loose, local-path, and malformed sources are rejected', () => {
    for (const source of ['npm:@acme/pdf@latest', 'npm:@acme/pdf@~1.4', 'npm:@acme/pdf', 'git:https://host/repo.git#main',
      `git:file:///repo#${commit}`, 'dev:@acme/pdf@1', 'dev:acme-pdf@0', 'local:abc', '@acme/pdf', 'file:../pdf']) {
      expect(sourceSchema.safeParse(source).success, source).toBe(false);
    }
  });

  it('M0.3-E14 integrity fits the source kind', () => {
    const path = ['extensions.@acme/pdf.integrity'];
    expect(issuePaths(presetSchema, presetWithPdfEntry({ source: `git:https://host/repo.git#${commit}`, integrity: 'sha512-abc=' }))).toEqual(path);
    expect(issuePaths(presetSchema, presetWithPdfEntry({ source: 'dev:acme-pdf@3', integrity: 'sha512-abc=' }))).toEqual(path);
    expect(issuePaths(presetSchema, presetWithPdfEntry({ source: 'npm:@acme/pdf@1.4.2' }))).toEqual(path);
    expect(presetSchema.safeParse(presetWithPdfEntry({ source: 'dev:acme-pdf@3', digest })).success).toBe(true);
    expect(presetSchema.safeParse(presetWithPdfEntry({ source: `git:https://host/repo.git#${commit}`, integrity: `git:${commit}` })).success).toBe(true);
  });
});

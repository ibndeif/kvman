import { describe, expect, it } from 'vitest';
import { extensionManifestSchema } from '../src/index.ts';

const manifest = {
  name: '@kvman/kvcoder',
  version: '1.0.0',
  main: 'dist/index.js',
  scripts: { build: 'tsc' },
  devDependencies: { typescript: '6.0.3' },
  peerDependencies: { '@kvman/sdk': '^1.0.0' },
  kvman: { namespace: 'kvcoder', source: 'src/index.ts', dependencies: { '@kvman/kvai': '^1.0.0', '@kvman/kvwebui': '^1.0.0' } },
};

function issuePaths(value: unknown): string[] {
  const result = extensionManifestSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('extension manifest (02 §2.9, ADR 0009)', () => {
  it('M1.2-H1 a valid manifest parses, other package.json fields included', () => {
    expect(extensionManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('M1.2-E1 a manifest without main fails', () => {
    const { main: _main, ...withoutMain } = manifest;
    expect(issuePaths(withoutMain)).toEqual(['main']);
  });

  it('M1.2-E2 a manifest without the @kvman/sdk peer fails', () => {
    const { peerDependencies: _peers, ...withoutPeers } = manifest;
    expect(issuePaths(withoutPeers)).toEqual(['peerDependencies']);
    expect(issuePaths({ ...manifest, peerDependencies: { vue: '3.0.0' } })).toEqual(['peerDependencies.@kvman/sdk']);
  });

  it('M1.2-E3 an unknown key in the kvman field fails', () => {
    const result = extensionManifestSchema.safeParse({ ...manifest, kvman: { namespace: 'kvcoder', dependancies: {} } });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: 'unrecognized_keys', keys: ['dependancies'], path: ['kvman'] }]);
  });

  it('M1.2-E4 a namespace is lowercase with kebab-case words', () => {
    for (const namespace of ['KvAi', 'kv.ai', 'kv_ai', '-kvai']) {
      expect(issuePaths({ ...manifest, kvman: { namespace } }), namespace).toEqual(['kvman.namespace']);
    }
    expect(issuePaths({ ...manifest, kvman: { namespace: 'kv-ai' } })).toEqual([]);
  });

  it('M1.2-E5 the version is exact and the name is an npm name', () => {
    expect(issuePaths({ ...manifest, version: '^1.0.0' })).toEqual(['version']);
    expect(issuePaths({ ...manifest, name: 'Bad Name' })).toEqual(['name']);
  });

  it('M1.2-E6 a manifest without the kvman field fails', () => {
    const { kvman: _kvman, ...withoutKvman } = manifest;
    expect(issuePaths(withoutKvman)).toEqual(['kvman']);
  });
});

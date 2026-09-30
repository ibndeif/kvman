import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExtensionSource } from '@kvman/sdk';
import { readExtension } from '../../src/extensions/manifests.ts';
import { checkTrust, type ExtensionVersion } from '../../src/extensions/trust.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const temporaryHome = useTemporaryHomes();

function writeExtension(folder: string, version: string): void {
  mkdirSync(folder, { recursive: true });
  const manifest = { name: '@test/x', version, main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'x' } };
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest));
}

// Runs a trust check of `@test/x` from `source` (relative to `presetFolder`), recording what was asked.
async function check(test: TestHome, presetFolder: string, source: ExtensionSource, answer: boolean): Promise<ExtensionVersion[][]> {
  const asked: ExtensionVersion[][] = [];
  const extension = readExtension('@test/x', source, { home: test.home, presetFolder, bundled: new Map([['@test/x', path.join(test.home, 'x')]]) });
  await checkTrust(test.connection, test.clock, [extension], (versions) => {
    asked.push([...versions]);
    return Promise.resolve(answer);
  });
  return asked;
}

describe('trust (02 §2.9, ADR 0009, 48)', () => {
  it('M1.8-E17 a declined version fails EXTENSION_INVALID, listing it, and is asked again', async () => {
    const test = temporaryHome();
    writeExtension(path.join(test.home, 'presets', 'x'), '1.0.0');
    const presets = path.join(test.home, 'presets');
    await expect(check(test, presets, 'path:./x', false)).rejects.toMatchObject({
      problem: { code: 'EXTENSION_INVALID', params: { versions: [`@test/x@1.0.0 (path:${path.join(presets, 'x')})`] } },
    });
    expect(await check(test, presets, 'path:./x', true)).toEqual([[{ name: '@test/x', version: '1.0.0', source: `path:${path.join(presets, 'x')}` }]]);
    expect(await check(test, presets, 'path:./x', false)).toEqual([]);
  });

  it('M1.8-E18 a path: version is remembered by its absolute folder, so the same relative path elsewhere asks again', async () => {
    const test = temporaryHome();
    for (const presets of ['one', 'two']) writeExtension(path.join(test.home, presets, 'x'), '1.0.0');
    expect(await check(test, path.join(test.home, 'one'), 'path:./x', true)).toHaveLength(1);
    expect(await check(test, path.join(test.home, 'two'), 'path:./x', true)).toEqual([[{ name: '@test/x', version: '1.0.0', source: `path:${path.join(test.home, 'two', 'x')}` }]]);
    writeExtension(path.join(test.home, 'one', 'x'), '1.1.0');
    expect(await check(test, path.join(test.home, 'one'), 'path:./x', true)).toEqual([[{ name: '@test/x', version: '1.1.0', source: `path:${path.join(test.home, 'one', 'x')}` }]]);
  });

  it('M1.8-E19 bundled extensions are never asked about', async () => {
    const test = temporaryHome();
    writeExtension(path.join(test.home, 'x'), '1.0.0');
    expect(await check(test, test.home, 'bundled', false)).toEqual([]);
  });
});

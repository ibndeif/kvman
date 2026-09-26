import { createHash } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '@kvman/protocol';
import { buildFileList, nativeCodeWarning, snapshotDigest, verifyTree } from '../../src/index.ts';
import { describe, expect, it } from 'vitest';
import { tree } from './trees.ts';

const files = { 'node_modules/b/index.js': 'b', 'node_modules/a/lib/deep.js': 'deep', 'node_modules/a/package.json': '{}' };

describe('file lists and digests (plan 06 §6.2 step 3, §6.5)', () => {
  it('M2.2-E20 every file with its size and sha256, sorted; the digest hashes the canonical list', async () => {
    const list = await buildFileList(tree(files));
    expect(list.map((entry) => entry.path)).toEqual(['node_modules/a/lib/deep.js', 'node_modules/a/package.json', 'node_modules/b/index.js']);
    expect(list[0]).toEqual({ path: 'node_modules/a/lib/deep.js', size: 4, sha256: createHash('sha256').update('deep').digest('hex') });
    expect(snapshotDigest(list)).toBe(createHash('sha256').update(canonicalJson(list)).digest('hex'));
    expect(snapshotDigest(await buildFileList(tree(files)))).toBe(snapshotDigest(list));
  });

  it('M2.2-E21 a changed, added, or removed file fails verification', async () => {
    const digest = snapshotDigest(await buildFileList(tree(files)));
    const untouched = tree(files);
    writeFileSync(join(untouched, 'manifest.json'), '{}');
    expect(await verifyTree(untouched, digest)).toBe(true);
    const changed = tree({ ...files, 'node_modules/b/index.js': 'c' });
    const added = tree({ ...files, 'node_modules/b/extra.js': '' });
    const removed = tree(files);
    rmSync(join(removed, 'node_modules', 'b', 'index.js'));
    for (const folder of [changed, added, removed]) expect(await verifyTree(folder, digest)).toBe(false);
  });

  it('M2.2-E22 a .node file makes the NATIVE_CODE warning, naming its package', async () => {
    const native = await buildFileList(tree({ ...files, 'node_modules/@img/sharp/build/sharp.node': 'binary', 'node_modules/@acme/sample/index.js': '' }));
    expect(nativeCodeWarning(native)).toEqual({ path: '', message: 'uses native code', code: 'NATIVE_CODE', severity: 'warning', params: { packages: ['@img/sharp'] } });
    expect(nativeCodeWarning(await buildFileList(tree(files)))).toBeUndefined();
  });
});

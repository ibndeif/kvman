import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { command } from '../install/harness.ts';
import { query, valueOf } from '../workspaces/harness.ts';
import { sha256 } from '../blobs/harness.ts';
import { fileTests, files, openFilesFixture, writeIn, type FilesFixture } from './harness.ts';

let fixture: FilesFixture;
beforeEach(async () => {
  fixture = await openFilesFixture();
});
afterEach(async () => {
  await fixture.close();
});

const run = (payload: Record<string, unknown>): Promise<unknown> => files(fixture, 'filer.run', JSON.parse(JSON.stringify(payload)));

describe('ctx.files (plan 07 §7.2, ADR 0136)', fileTests, () => {
  it('M2.5-E23 ctx.files round trip', async () => {
    expect(await run({ op: 'write', path: 'notes/a.md', content: '# A' })).toEqual({ value: null });
    expect(await run({ op: 'write', path: 'data/b.bin', base64: Buffer.from([0, 1, 2]).toString('base64') })).toEqual({ value: null });
    expect(await run({ op: 'read', path: 'notes/a.md' })).toEqual({ value: '# A' });
    expect(await run({ op: 'stat', path: 'notes/a.md' })).toEqual({ value: { kind: 'file', size: 3, modifiedAt: expect.any(Number) } });
    expect(await run({ op: 'list' })).toEqual({ value: [{ name: 'data', kind: 'directory', size: expect.any(Number) }, { name: 'notes', kind: 'directory', size: expect.any(Number) }] });
    expect(await run({ op: 'list', path: 'notes' })).toEqual({ value: [{ name: 'a.md', kind: 'file', size: 3 }] });
    writeIn(fixture.root, 'notes/deep/c.md', 'c');
    expect(await run({ op: 'glob', pattern: '**/*.md' })).toEqual({ value: ['notes/a.md', 'notes/deep/c.md'] });
    expect(await run({ op: 'mkdir', path: 'notes' })).toEqual({ value: null });
    expect(await run({ op: 'rm', path: 'missing' })).toEqual({ value: null });
    expect(await run({ op: 'rm', path: 'notes' })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await run({ op: 'rm', path: 'notes', recursive: true })).toEqual({ value: null });
    expect(await run({ op: 'stat', path: 'notes' })).toEqual({ value: null });
  });

  it('M2.5-E24 capabilities of ctx.files', async () => {
    writeIn(fixture.root, 'a.md', 'a');
    expect(await files(fixture, 'keeper.put', { workspacePath: 'a.md' })).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(await files(fixture, 'reader.run', { op: 'read', path: 'a.md' })).toEqual({ value: 'a' });
    for (const op of ['write', 'mkdir', 'rm']) expect(await files(fixture, 'reader.run', { op, path: 'b.md' }), op).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(await query(fixture, 'filer.look', { op: 'read', path: 'a.md' }, undefined, fixture.workspaceId)).toEqual({ ok: true, value: { value: 'a' } });
    expect(await query(fixture, 'filer.look', { op: 'write', path: 'b.md', content: 'b' }, undefined, fixture.workspaceId)).toMatchObject({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    expect(valueOf(await command(fixture, 'filer.global', {}))).toMatchObject({ code: 'WORKSPACE_INVALID' });
  });

  it('M2.5-E27 missing paths and limits', async () => {
    expect(await run({ op: 'read', path: 'missing.md' })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await run({ op: 'list', path: 'missing' })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await run({ op: 'stat', path: 'missing.md' })).toEqual({ value: null });
    writeIn(fixture.root, 'big.txt', Buffer.alloc(16 * 1024 * 1024 + 1, 0x61));
    expect(await run({ op: 'read', path: 'big.txt' })).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { limit: 'file', max: 16777216 } });
    expect(await run({ op: 'write', path: 'big2.txt', size: 16 * 1024 * 1024 + 1 })).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { limit: 'file', max: 16777216 } });
    for (let index = 0; index <= 5000; index += 1) writeIn(fixture.root, `many/${index}.log`, '');
    expect(await run({ op: 'glob', pattern: 'many/*.log' })).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', params: { limit: 'glob', max: 5000 } });
  });

  it('M2.5-E28 a blob from a workspace file', async () => {
    writeIn(fixture.root, 'data/b.bin', Buffer.from([7, 8, 9]));
    expect(await files(fixture, 'filer.blob', { path: 'data/b.bin' })).toEqual({ value: sha256(Buffer.from([7, 8, 9])) });
    expect(await files(fixture, 'keeper.put', { workspacePath: 'data/b.bin' })).toMatchObject({ code: 'CAPABILITY_DENIED' });
    writeIn(fixture.root, '.kvman/x', 'x');
    expect(await files(fixture, 'filer.blob', { path: '.kvman/x' })).toMatchObject({ code: 'WORKSPACE_UNTRUSTED' });
    expect(await files(fixture, 'filer.blob', { path: '../x' })).toMatchObject({ code: 'WORKSPACE_ESCAPE' });
  });
});

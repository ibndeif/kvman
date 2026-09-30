import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFiles } from '../../src/files/files.ts';
import { fileLimitBytes } from '../../src/limits.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

function filesOf(test: TestHome) {
  return createFiles({ connection: test.connection, home: test.home, ids: test.ids, clock: test.clock });
}

const owner = { kind: 'extension', name: '@test/notes' } as const;

describe('files (02 §2.7)', () => {
  it('M1.3-H7 a file over 1 GiB fails TOO_LARGE and leaves nothing behind', () => {
    const test = newHome();
    const files = filesOf(test);
    const tooLarge = new Uint8Array(fileLimitBytes + 1);
    expect(() => files.write({ name: 'big.bin', data: tooLarge, type: 'application/octet-stream', owner, workspaceId: 'home' }))
      .toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'TOO_LARGE', params: { limit: fileLimitBytes } }) }));
    expect(test.connection.prepare('SELECT count(*) AS total FROM files').get()).toEqual({ total: 0 });
    expect(existsSync(path.join(test.home, 'files')) ? readdirSync(path.join(test.home, 'files')) : []).toEqual([]);
  });

  it('M1.3-E16 write keeps the content and a row; read returns it, and path is absolute', () => {
    const test = newHome();
    const files = filesOf(test);
    const bytes = files.write({ name: 'data.bin', data: new Uint8Array([1, 2, 3]), type: 'application/octet-stream', owner, workspaceId: 'home' });
    const text = files.write({ name: 'notes.md', data: 'héllo', type: 'text/markdown', owner: { kind: 'user' }, workspaceId: 'workspace-a' });
    expect(bytes).toEqual({ id: bytes.id, name: 'data.bin', type: 'application/octet-stream', size: 3, owner, workspaceId: 'home', createdAt: '2026-09-30T03:00:00.000Z' });
    expect(text.size).toBe(6);
    expect(files.get(text.id)).toEqual(text);
    expect([...files.read(bytes.id)]).toEqual([1, 2, 3]);
    expect(files.read(text.id).toString('utf8')).toBe('héllo');
    expect(files.path(text.id)).toBe(path.join(test.home, 'files', text.id));
    expect(path.isAbsolute(files.path(text.id))).toBe(true);
  });

  it('M1.3-E17 a missing id is not found, and unlink removes the row and the content', () => {
    const test = newHome();
    const files = filesOf(test);
    const missing = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    for (const call of [() => files.get(missing), () => files.read(missing), () => files.path(missing), () => files.unlink(missing)]) {
      expect(call).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
    }
    const file = files.write({ name: 'a.txt', data: 'a', type: 'text/plain', owner, workspaceId: 'home' });
    const content = files.path(file.id);
    files.unlink(file.id);
    expect(existsSync(content)).toBe(false);
    expect(() => files.get(file.id)).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
  });
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { logFile, startFolder } from '../src/start-folder.ts';

describe('where kvman starts (15 §15.3, ADR 0099, 6 and 15)', () => {
  it('M4.2-H1 the first folder, when it is local', () => {
    expect(startFolder([{ scheme: 'file', fsPath: '/work/a' }, { scheme: 'file', fsPath: '/work/b' }], '/home/p')).toEqual({ kind: 'local', path: '/work/a' });
  });

  it('M4.2-H2 a window with no folder starts in the user home folder', () => {
    expect(startFolder(undefined, '/home/p')).toEqual({ kind: 'local', path: '/home/p' });
    expect(startFolder([], '/home/p')).toEqual({ kind: 'local', path: '/home/p' });
  });

  it('M4.2-H3 a remote or virtual first folder is remote, whatever the others are', () => {
    expect(startFolder([{ scheme: 'vscode-remote', fsPath: '/home/a' }], '/home/p')).toEqual({ kind: 'remote' });
    expect(startFolder([{ scheme: 'vscode-vfs', fsPath: '/a/b' }, { scheme: 'file', fsPath: '/work' }], '/home/p')).toEqual({ kind: 'remote' });
  });

  it("M4.2-H9 the log is in kvman's home: KVMAN_HOME, else ~/.kvman", () => {
    expect(logFile(undefined, '/home/p')).toBe(path.join('/home/p', '.kvman', 'logs', 'kvman.log'));
    expect(logFile('/data/kv', '/home/p')).toBe(path.join('/data/kv', 'logs', 'kvman.log'));
  });
});

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileWithin } from '../../src/http/static-files.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function webFolder(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-web-'));
  folders.push(root);
  const web = path.join(root, 'web');
  mkdirSync(path.join(web, 'assets'), { recursive: true });
  writeFileSync(path.join(web, 'assets', 'app.js'), 'x');
  writeFileSync(path.join(root, 'secret.txt'), 'outside');
  symlinkSync(path.join(root, 'secret.txt'), path.join(web, 'leak.txt'));
  return web;
}

describe('files of a web folder (04 §4.1)', () => {
  it('M1.7-H6 a path that leaves the folder is no file of it', () => {
    const web = webFolder();
    expect(fileWithin(web, '../secret.txt')).toBeUndefined();
    expect(fileWithin(web, 'leak.txt')).toBeUndefined();
  });

  it('M1.7-E17 only a file inside the folder is found', () => {
    const web = webFolder();
    expect(fileWithin(web, 'assets/app.js')).toMatch(/assets[\\/]app\.js$/);
    expect(fileWithin(web, '/assets/app.js')).toMatch(/assets[\\/]app\.js$/);
    for (const miss of ['..%2fsecret.txt', 'assets/..%2f..%2fsecret.txt', 'missing.js', 'assets', 'app.js%00', '%E0%A4%A']) {
      expect(fileWithin(web, miss)).toBeUndefined();
    }
  });
});

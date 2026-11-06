import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { answerPageRequest as answerWith, pageAddress, pageOrigin } from '../../src/record/page-route.ts';
import { sceneAssetsOf } from '../../src/record/scene-address.ts';

const answerPageRequest = (folder: string, address: string) => answerWith(folder, address, sceneAssetsOf(folder, null));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folders(): { folder: string; outside: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'kvvideo-page-'));
  roots.push(root);
  const folder = path.join(root, 'workspace', 'videos', 't');
  const outside = path.join(root, 'outside');
  mkdirSync(path.join(folder, 'img'), { recursive: true });
  mkdirSync(outside);
  for (const file of ['a.css', 'img/b.png', 'font.woff2', 'data.json', 'notes.xyz', 'a b.css']) writeFileSync(path.join(folder, file), 'x');
  writeFileSync(path.join(root, 'workspace', 'videos', 'secret.txt'), 'secret');
  writeFileSync(path.join(outside, 'x.txt'), 'outside');
  symlinkSync(outside, path.join(folder, 'link'));
  return { folder, outside };
}

const at = (relative: string): string => `${pageOrigin}/${relative}`;

describe("a page's own files (16 §16.5, ADR 0115, 32)", () => {
  it('M5.5-H5 a file under the page folder is answered with its type', () => {
    const { folder } = folders();
    expect(answerPageRequest(folder, at('a.css'))).toEqual({ status: 200, file: path.join(folder, 'a.css'), contentType: 'text/css; charset=utf-8' });
    expect(answerPageRequest(folder, at('img/b.png'))).toMatchObject({ status: 200, contentType: 'image/png' });
    expect(answerPageRequest(folder, at('font.woff2'))).toMatchObject({ status: 200, contentType: 'font/woff2' });
    expect(answerPageRequest(folder, at('data.json?v=2'))).toMatchObject({ status: 200, contentType: 'application/json' });
    expect(answerPageRequest(folder, at('notes.xyz'))).toMatchObject({ status: 200, contentType: 'application/octet-stream' });
    expect(answerPageRequest(folder, at('img%2Fb.png'))).toMatchObject({ status: 200, file: path.join(folder, 'img', 'b.png') });
    expect(answerPageRequest(folder, at('a%20b.css'))).toMatchObject({ status: 200, file: path.join(folder, 'a b.css') });
    expect(pageAddress('/w/videos/t/title page.html')).toBe(`${pageOrigin}/title%20page.html`);
  });

  it('M5.5-E6 a path out of the folder, through a symlink, missing, or badly encoded is 404', () => {
    const { folder } = folders();
    for (const relative of ['../secret.txt', '%2E%2E/secret.txt', '..%2Fsecret.txt', 'link/x.txt', 'missing.css', 'img', '', '%E0%A4%A']) {
      expect(answerPageRequest(folder, at(relative))).toEqual({ status: 404 });
    }
  });
});

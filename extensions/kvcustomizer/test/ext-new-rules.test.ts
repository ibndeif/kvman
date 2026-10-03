import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });
const saved = { ...process.env };
const roots: string[] = [];

afterEach(() => {
  process.env = { ...saved };
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A port that refuses connections: one the OS gave a server that has closed again.
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return typeof address === 'object' && address !== null ? address.port : 0;
}

describe('ext new rules (09 §9.1, ADR 0009, 121, 126)', { timeout: 30_000 }, () => {
  it('M2.5-E3 a folder outside the workspace fails VALIDATION_FAILED, and one holding a file kvcustomizer/FOLDER_NOT_EMPTY, writing nothing', async () => {
    const world = await kvcustomizer.start();
    await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: '../notes' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: path.join(tmpdir(), 'kvcustomizer-elsewhere') })).rejects.toEqual(failed('VALIDATION_FAILED'));
    world.write('taken/notes.txt', 'mine');
    await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'taken' })).rejects.toEqual(failed('kvcustomizer/FOLDER_NOT_EMPTY'));
    expect(existsSync(path.join(world.workspace, 'taken', 'package.json'))).toBe(false);
  });

  it('M2.5-E4 an invalid package name or namespace fails VALIDATION_FAILED', async () => {
    const world = await kvcustomizer.start();
    for (const name of ['Notes', 'my notes', '@/x']) {
      await expect(world.kernel.exec('kvcustomizer.ext.new', { name, namespace: 'notes', folder: 'a' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    for (const namespace of ['Notes', 'my_notes', 'kernel']) {
      await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace, folder: 'a' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    expect(existsSync(path.join(world.workspace, 'a'))).toBe(false);
  });

  it('M2.5-E5 a failing npm install fails kvcustomizer/NPM_FAILED with npm output, and the files stay', async () => {
    const cache = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-npm-cache-'));
    roots.push(cache);
    Object.assign(process.env, { npm_config_registry: `http://127.0.0.1:${String(await closedPort())}/`, npm_config_fetch_retries: '0', npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' });
    const world = await kvcustomizer.start();
    const error: unknown = await world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' }).catch((thrown: unknown) => thrown);
    expect(error).toEqual(failed('kvcustomizer/NPM_FAILED'));
    expect(error).toEqual(expect.objectContaining({ problem: expect.objectContaining({ message: expect.stringMatching(/npm install failed in notes \(exit code \d+\):\n.*npm error/s) }) }));
    expect(existsSync(path.join(world.workspace, 'notes', 'src', 'index.ts'))).toBe(true);
  });
});

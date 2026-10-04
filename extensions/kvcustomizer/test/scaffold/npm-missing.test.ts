import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvcustomizer } from '../support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();
const saved = { ...process.env };
const roots: string[] = [];

afterEach(() => {
  for (const key of Object.keys(process.env)) { if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key]; }
  Object.assign(process.env, saved);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A registry that always refuses: port 1 never listens on 127.0.0.1.
const refusedRegistry = 'http://127.0.0.1:1/';

describe('npm failures (ADR 0009, 126)', () => {
  it('M2.5-E6 npm missing from the PATH fails kvcustomizer/NPM_FAILED', async () => {
    const emptyBin = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-no-npm-'));
    roots.push(emptyBin);
    process.env['PATH'] = emptyBin;
    const world = await kvcustomizer.start();
    await expect(world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' })).rejects.toEqual(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'kvcustomizer/NPM_FAILED', message: "npm isn't on the PATH; install Node.js with npm." }) }),
    );
  });

  it('QA17-E12 a failed install keeps the files with npm lines, and missing npm is kvcustomizer/NPM_FAILED', async () => {
    const cache = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-npm-cache-'));
    roots.push(cache);
    Object.assign(process.env, { npm_config_registry: refusedRegistry, npm_config_fetch_retries: '0', npm_config_cache: cache });
    const world = await kvcustomizer.start();
    const error: unknown = await world.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' }).catch((thrown: unknown) => thrown);
    expect(error).toEqual(expect.objectContaining({ problem: expect.objectContaining({ code: 'kvcustomizer/NPM_FAILED' }) }));
    const message = (error as { problem: { message: string } }).problem.message;
    expect(message).toMatch(/npm install failed in notes \(exit code \d+\):\n.*npm error/s);
    expect(message.split('\n').at(-1)).toMatch(/\S/);
    expect(existsSync(path.join(world.workspace, 'notes', 'src', 'index.ts'))).toBe(true);

    const emptyBin = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-no-npm-'));
    roots.push(emptyBin);
    process.env['PATH'] = emptyBin;
    const second = await kvcustomizer.start();
    await expect(second.kernel.exec('kvcustomizer.ext.new', { name: 'notes', namespace: 'notes', folder: 'other' })).rejects.toEqual(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'kvcustomizer/NPM_FAILED', message: "npm isn't on the PATH; install Node.js with npm." }) }),
    );
  });
});

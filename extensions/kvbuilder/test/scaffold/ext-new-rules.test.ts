import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { useKvbuilder } from '../support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });
const saved = { ...process.env };
const roots: string[] = [];

afterEach(() => {
  for (const key of Object.keys(process.env)) { if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key]; }
  Object.assign(process.env, saved);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A registry that always refuses: port 1 never listens on 127.0.0.1.
const refusedRegistry = 'http://127.0.0.1:1/';

describe('ext new rules (09 §9.1, ADR 0009, 121, 126)', { timeout: 30_000 }, () => {
  it('M2.5-E3 a folder outside the workspace fails VALIDATION_FAILED, and one holding a file kvbuilder/FOLDER_NOT_EMPTY, writing nothing', async () => {
    const world = await kvbuilder.start();
    await expect(world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: '../notes' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: path.join(tmpdir(), 'kvbuilder-elsewhere') })).rejects.toEqual(failed('VALIDATION_FAILED'));
    world.write('taken/notes.txt', 'mine');
    await expect(world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'taken' })).rejects.toEqual(failed('kvbuilder/FOLDER_NOT_EMPTY'));
    expect(existsSync(path.join(world.workspace, 'taken', 'package.json'))).toBe(false);
  });

  it('M2.5-E4 an invalid package name or namespace fails VALIDATION_FAILED', async () => {
    const world = await kvbuilder.start();
    for (const name of ['Notes', 'my notes', '@/x']) {
      await expect(world.kernel.exec('kvbuilder.ext.new', { name, namespace: 'notes', folder: 'a' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    for (const namespace of ['Notes', 'my_notes', 'kernel']) {
      await expect(world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace, folder: 'a' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    expect(existsSync(path.join(world.workspace, 'a'))).toBe(false);
  });

  it('M2.5-E5 a failing npm install fails kvbuilder/NPM_FAILED with npm output, and the files stay', async () => {
    const cache = mkdtempSync(path.join(tmpdir(), 'kvbuilder-npm-cache-'));
    roots.push(cache);
    Object.assign(process.env, { npm_config_registry: refusedRegistry, npm_config_fetch_retries: '0', npm_config_cache: cache, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' });
    const world = await kvbuilder.start();
    const error: unknown = await world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' }).catch((thrown: unknown) => thrown);
    expect(error).toEqual(failed('kvbuilder/NPM_FAILED'));
    expect(error).toEqual(expect.objectContaining({ problem: expect.objectContaining({ message: expect.stringMatching(/npm install failed in notes \(exit code \d+\):\n.*npm error/s) }) }));
    expect(existsSync(path.join(world.workspace, 'notes', 'src', 'index.ts'))).toBe(true);
  });

  it('QA17-E11 the bin reports FOLDER_NOT_EMPTY with the folder as given, and an empty folder runs up to the install', async () => {
    const cache = mkdtempSync(path.join(tmpdir(), 'kvbuilder-empty-cache-'));
    roots.push(cache);
    Object.assign(process.env, { npm_config_registry: refusedRegistry, npm_config_fetch_retries: '0', npm_config_cache: cache });
    const world = await kvbuilder.start();
    world.write('taken/notes.txt', 'mine');
    const taken: unknown = await world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'taken' }).catch((thrown: unknown) => thrown);
    expect(taken).toEqual(failed('kvbuilder/FOLDER_NOT_EMPTY'));
    expect(taken).toEqual(expect.objectContaining({ problem: expect.objectContaining({ params: expect.objectContaining({ folder: 'taken' }) }) }));
    mkdirSync(path.join(world.workspace, 'empty'));
    await expect(world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'empty' })).rejects.toEqual(failed('kvbuilder/NPM_FAILED'));
    expect(existsSync(path.join(world.workspace, 'empty', 'src', 'index.ts'))).toBe(true);
  });
});

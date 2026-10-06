import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { binFile } from '../../src/run-bin.ts';
import { useKvbuilder } from '../support/kvbuilder-kernel.ts';
import { npmEnvironment } from '../support/npm-environment.ts';

const kvbuilder = useKvbuilder();
const saved = { ...process.env };
const roots: string[] = [];

beforeEach(() => Object.assign(process.env, npmEnvironment()));
afterEach(() => {
  for (const key of Object.keys(process.env)) { if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key]; }
  Object.assign(process.env, saved);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const repositoryRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');

describe('the connectors run the testkit bins (ADR 0010, 2, 3)', () => {
  it('QA17-H15 the kvman-new bin resolves to the built testkit file', () => {
    const file = binFile('kvman-new');
    expect(file).toBe(path.join(repositoryRoot, 'packages', 'testkit', 'dist', 'new', 'new-bin.js'));
    expect(existsSync(file)).toBe(true);
  });

  it('QA17-H15 ext new answers the bin JSON with a workspace-relative folder and writes the scaffold', async () => {
    const world = await kvbuilder.start();
    expect(await world.kernel.exec('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' })).toEqual({ folder: 'notes', name: 'notes', namespace: 'notes', web: false });
    const folder = path.join(world.workspace, 'notes');
    for (const file of ['package.json', 'src/index.ts', 'src/docs.ts', 'AGENTS.md', 'docs/sdk.md']) expect(existsSync(path.join(folder, file)), file).toBe(true);
    const second = await kvbuilder.start();
    expect(await second.kernel.exec('kvbuilder.ext.new', { name: '@me/cards', namespace: 'cards', folder: 'cards', web: true })).toMatchObject({ folder: 'cards', web: true });
  });

  it('QA17-H15 preset new writes the skeleton and preset check answers its findings with the file as given', async () => {
    const world = await kvbuilder.start();
    const emptyHome = mkdtempSync(path.join(tmpdir(), 'kvbuilder-no-kvman-'));
    roots.push(emptyHome);
    process.env['KVMAN_HOME'] = emptyHome;
    expect(await world.kernel.exec('kvbuilder.preset.new', { name: 'mine', file: 'presets/mine.json' })).toEqual({ file: 'presets/mine.json' });
    expect(JSON.parse(readFileSync(path.join(world.workspace, 'presets', 'mine.json'), 'utf8'))).toEqual({
      name: 'mine',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled' },
      settings: { 'kvwebui.home': 'kvwebui.extensions' },
    });
    expect(await world.kernel.exec('kvbuilder.preset.check', { file: 'presets/mine.json' })).toEqual([]);
    world.write('presets/bad.json', { name: 'app', extensions: { '@kvman/kvai': 'bundled' }, colour: 'red' });
    const findings = await world.kernel.exec('kvbuilder.preset.check', { file: 'presets/bad.json' });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe('presets/bad.json');
  });

  it('QA17-H15 the extension source never imports the testkit or the kernel', () => {
    const sources: string[] = [];
    const walk = (folder: string): void => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const absolute = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && entry.name.endsWith('.ts')) sources.push(absolute);
      }
    };
    walk(path.join(repositoryRoot, 'extensions', 'kvbuilder', 'src'));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]@kvman\/testkit['"]/);
      expect(text, file).not.toMatch(/from\s+['"]@kvman\/kernel['"]/);
      expect(text, file).not.toMatch(/require\(['"]@kvman\/testkit['"]/);
      expect(text, file).not.toMatch(/require\(['"]@kvman\/kernel['"]/);
    }
  });

  it('QA17-E14 a cancelled job kills the bin process tree', async () => {
    let seenConnection: (() => void) | undefined;
    const connected = new Promise<void>((resolve) => {
      seenConnection = resolve;
    });
    let closedConnection: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => {
      closedConnection = resolve;
    });
    const server: Server = createServer(() => undefined);
    server.on('connection', (socket: Socket) => {
      seenConnection?.();
      socket.once('close', () => closedConnection?.());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      const cache = mkdtempSync(path.join(tmpdir(), 'kvbuilder-cancel-cache-'));
      roots.push(cache);
      Object.assign(process.env, { npm_config_registry: `http://127.0.0.1:${String(port)}/`, npm_config_fetch_retries: '0', npm_config_cache: cache });
      const world = await kvbuilder.start();
      const jobId = await world.kernel.execAsync('kvbuilder.ext.new', { name: 'notes', namespace: 'notes', folder: 'notes' });
      await connected;
      world.kernel.cancel(jobId);
      expect(await world.kernel.waitForJob(jobId)).toMatchObject({ status: 'cancelled' });
      await closed;
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { registerLook } from '../src/look/register-look.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const folders: string[] = [];
const savedHome = process.env['KVMAN_HOME'];
afterEach(() => {
  if (savedHome === undefined) delete process.env['KVMAN_HOME'];
  else process.env['KVMAN_HOME'] = savedHome;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const codeOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => 'ran',
    (error: unknown) => (error instanceof ProblemError ? error.problem.code : error),
  );

const folder = (prefix: string): string => {
  const made = mkdtempSync(path.join(tmpdir(), prefix));
  folders.push(made);
  return made;
};

describe('video look checks its input before a browser starts (16 §16.5 Looking, ADR 0117)', { timeout: 60_000 }, () => {
  it('M5.12-E1 moments out of their limits fail VALIDATION_FAILED', async () => {
    const { kernel, write } = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge' } });
    write('t.html', '<p>Title</p>');
    for (const atMs of [[0, 1, 2, 3, 4, 5, 6], [], [500, 500], [-1], [60_001], [0.5]]) {
      expect(await codeOf(kernel.exec('kvvideo.frame.capture', { page: 't.html', atMs })), JSON.stringify(atMs)).toBe('VALIDATION_FAILED');
    }
  });

  it("M5.12-E2 a source like record's: one of url and page, an HTML page inside the workspace, an http address that isn't kvman's, an even width", async () => {
    const home = folder('kvvideo-home-');
    writeFileSync(path.join(home, 'kvman.lock'), JSON.stringify({ pid: process.pid, port: 3737 }));
    process.env['KVMAN_HOME'] = home;
    const { kernel, write, workspace } = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge' } });
    write('t.html', '<p>Title</p>');
    write('notes.txt', 'x');
    const outside = folder('kvvideo-outside-');
    writeFileSync(path.join(outside, 'p.html'), '<p>x</p>');
    symlinkSync(outside, path.join(workspace, 'away'));
    const inputs = [
      { url: 'http://localhost:5173/', page: 't.html' },
      {},
      { page: 'notes.txt' },
      { page: '../out.html' },
      { page: 'away/p.html' },
      { url: 'ftp://example.com/' },
      { url: 'http://127.0.0.1:3737/' },
      { page: 't.html', width: 641 },
    ];
    for (const input of inputs) expect(await codeOf(kernel.exec('kvvideo.frame.capture', input)), JSON.stringify(input)).toBe('VALIDATION_FAILED');
    expect(await codeOf(kernel.exec('kvvideo.frame.capture', { page: 'missing.html' }))).toBe('NOT_FOUND');
  });

  it('M5.12-E6 look has 2 minutes, is public, and is not retried', () => {
    const registered = new Map<string, { timeoutMs?: number; public?: boolean; retries?: number }>();
    const ctx = { registerCommand: (name: string, definition: { timeoutMs?: number }) => registered.set(name, definition) } as unknown as Ctx;
    registerLook(ctx);
    expect(registered.get('kvvideo.frame.capture')).toMatchObject({ timeoutMs: 120_000, public: true, retries: 0 });
  });
});

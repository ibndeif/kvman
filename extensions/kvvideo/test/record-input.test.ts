import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

const homes: string[] = [];
const savedHome = process.env['KVMAN_HOME'];
afterEach(() => {
  if (savedHome === undefined) delete process.env['KVMAN_HOME'];
  else process.env['KVMAN_HOME'] = savedHome;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

describe('video record checks its input before a browser starts (16 §16.5)', { timeout: 60_000 }, () => {
  it('M5.2-E10 the connector has record, a command with an example', async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.commands?.find((command) => command.name === 'record')).toMatchObject({ command: 'kvvideo.clip.record', query: false, examples: [expect.objectContaining({ description: 'Record signing in to the app on its dev server' })] });
  });

  it("M5.2-E2 kvman's own address, as url or goto, fails before a browser starts", async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'kvvideo-home-'));
    homes.push(home);
    writeFileSync(path.join(home, 'kvman.lock'), JSON.stringify({ pid: process.pid, port: 3737 }));
    process.env['KVMAN_HOME'] = home;
    const { kernel } = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    expect(await problemOf(kernel.exec('kvvideo.clip.record', { url: 'http://127.0.0.1:3737/', file: 'a.mp4' }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await problemOf(kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file: 'a.mp4', steps: [{ do: 'goto', url: 'http://localhost:3737/x' }] }))).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('M5.2-E6 the output rules fail before a browser starts', async () => {
    const world = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    world.write('clip.mp4', 'old');
    const outside = mkdtempSync(path.join(tmpdir(), 'kvvideo-outside-'));
    homes.push(outside);
    symlinkSync(outside, path.join(world.workspace, 'away'));
    for (const file of ['clip.mp4', 'clip.webm', '../outside.mp4', 'away/clip.mp4']) {
      expect(await problemOf(world.kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });
});

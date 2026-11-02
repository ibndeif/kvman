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

// Past every check, a call fails for the missing Edge, or, where Edge is installed, for the missing ffmpeg.
const pastTheChecks = /^kvvideo\/(BROWSER|PROGRAM)_MISSING$/;

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

  it('M5.5-E3 M5.5-E4 url and page together or neither, and a goto in a page, fail before a browser starts', async () => {
    const world = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    world.write('t.html', '<p>Title</p>');
    for (const input of [{ url: 'http://localhost:5173/', page: 't.html', file: 'a.mp4' }, { file: 'a.mp4' }, { page: 't.html', file: 'a.mp4', steps: [{ do: 'goto' as const, url: 'http://localhost:5173/' }] }]) {
      expect(await problemOf(world.kernel.exec('kvvideo.clip.record', input))).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it("M5.5-E5 a page that isn't HTML, doesn't exist, or is outside the workspace", async () => {
    const world = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    world.write('notes.txt', 'x');
    const outside = mkdtempSync(path.join(tmpdir(), 'kvvideo-outside-'));
    homes.push(outside);
    writeFileSync(path.join(outside, 'p.html'), '<p>x</p>');
    symlinkSync(outside, path.join(world.workspace, 'away'));
    const codes = [];
    for (const page of ['notes.txt', 'missing.html', '../out.html', 'away/p.html']) codes.push(((await problemOf(world.kernel.exec('kvvideo.clip.record', { page, file: 'a.mp4' }))) as { code: string }).code);
    expect(codes).toEqual(['VALIDATION_FAILED', 'NOT_FOUND', 'VALIDATION_FAILED', 'VALIDATION_FAILED']);
  });

  it('M5.5-E7 a narration without captions, a missing one, one that is not audio, and atLine past its lines', async () => {
    const world = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    world.write('talk.mp3', 'audio');
    world.write('talk.mp3.kvvideo.json', JSON.stringify({ kind: 'narration', durationMs: 4000, captions: [0, 1500, 3000].map((startMs) => ({ text: 'Line.', startMs, endMs: startMs + 1000 })) }));
    world.write('bare.mp3', 'audio');
    world.write('notes.txt', 'x');
    const click = (atLine: number) => [{ do: 'click' as const, target: '#a', atLine }];
    const runs = [
      { narration: 'talk.mp3', steps: click(4) },
      { steps: click(1) },
      { narration: 'bare.mp3', steps: click(1) },
      { narration: 'missing.mp3', steps: click(1) },
      { narration: 'notes.txt', steps: click(1) },
    ];
    const codes = [];
    for (const run of runs) codes.push(((await problemOf(world.kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file: 'a.mp4', ...run }))) as { code: string }).code);
    expect(codes).toEqual(['VALIDATION_FAILED', 'VALIDATION_FAILED', 'VALIDATION_FAILED', 'NOT_FOUND', 'VALIDATION_FAILED']);
    expect(await problemOf(world.kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file: 'a.mp4', narration: 'talk.mp3', steps: click(3) }))).toMatchObject({ code: expect.stringMatching(pastTheChecks) });
  });

  it('M5.5-E10 an existing sidecar without its recording needs replace', async () => {
    const world = await kvvideo.start({ settings: { 'kvvideo.browser': 'msedge', 'kvvideo.programs.ffmpeg': '/nowhere/ffmpeg' } });
    world.write('clip.mp4.kvvideo.json', '{}');
    expect(await problemOf(world.kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file: 'clip.mp4' }))).toMatchObject({ code: 'VALIDATION_FAILED', params: { path: 'clip.mp4.kvvideo.json' } });
    expect(await problemOf(world.kernel.exec('kvvideo.clip.record', { url: 'http://localhost:5173/', file: 'clip.mp4', replace: true }))).toMatchObject({ code: expect.stringMatching(pastTheChecks) });
  });
});

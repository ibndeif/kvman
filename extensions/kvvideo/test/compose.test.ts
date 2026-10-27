import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { composes, probesLengths, useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo, type KvvideoWorld } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

type Run = { args: string[]; cwd: string; files: string[]; fonts: string[]; ass: string | null };
const runsOf = (ffmpeg: string): Run[] => (existsSync(`${ffmpeg}.log`) ? readFileSync(`${ffmpeg}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Run) : []);
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );
const workFoldersLeft = (ffmpeg: string): string[] => [...new Set(runsOf(ffmpeg).map((run) => run.cwd))].filter((folder) => existsSync(folder));

async function composing(fail = ''): Promise<KvvideoWorld & { ffmpeg: string }> {
  const ffmpeg = programs.program('ffmpeg', composes(fail));
  const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': programs.program('ffprobe', probesLengths) } });
  world.write('v/01.mp4', 'video');
  world.write('v/01.mp3', 'audio');
  world.write('v/title.png', 'image');
  return { ...world, ffmpeg };
}

const twoScenes = [
  { clip: 'v/title.png', durationMs: 2000 },
  { clip: 'v/01.mp4', narration: 'v/01.mp3', captions: [{ text: 'مرحبا', startMs: 0, endMs: 2500 }] },
];

describe('video compose (16 §16.7)', { timeout: 60_000 }, () => {
  it('M5.4-H6 one ffmpeg run per scene and one to join, the file placed, the answer summed, the work folder gone', async () => {
    const { kernel, workspace, ffmpeg } = await composing();
    const answer = await kernel.exec('kvvideo.video.compose', { file: 'videos/tour.mp4', scenes: twoScenes });
    expect(answer).toMatchObject({ file: 'videos/tour.mp4', durationMs: 4500, bytes: 'PART part-1.mp4\nPART part-2.mp4\n'.length, fileId: expect.any(String) });
    expect(readFileSync(`${workspace}/videos/tour.mp4`, 'utf8')).toBe('PART part-1.mp4\nPART part-2.mp4\n');
    const runs = runsOf(ffmpeg);
    expect(runs.map((run) => run.args.at(-1))).toEqual(['part-1.mp4', 'part-2.mp4', 'video.mp4']);
    expect(runs[0]?.ass).toBeNull();
    expect(runs[1]?.ass).toContain('Style: Default,IBM Plex Sans Arabic,40,');
    expect(runs[1]?.fonts).toEqual(['IBMPlexSansArabic-Bold.ttf']);
    expect(new Set(runs.map((run) => run.cwd)).size).toBe(1);
    expect(workFoldersLeft(ffmpeg)).toEqual([]);
  });

  it('M5.4-H11 the connector has compose, with an example and its card', async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.commands?.find((command) => command.name === 'compose')).toMatchObject({ command: 'kvvideo.video.compose', query: false, card: 'kvvideo.player', examples: [expect.objectContaining({ description: 'Join a title image and a narrated recording, with captions' })] });
  });

  it('M5.4-H7 copies: one per path, replaced on a new render, and only the newest 10 kept', async () => {
    const { kernel } = await composing();
    const copyOf = (id: string | null): boolean => id !== null && existsSync(`${kernel.home}/files/${id}`);
    const first = await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: twoScenes });
    const again = await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: twoScenes, replace: true });
    expect([copyOf(first.fileId), copyOf(again.fileId)]).toEqual([false, true]);
    const more = [];
    for (let index = 1; index <= 10; index += 1) more.push(await kernel.exec('kvvideo.video.compose', { file: `b${String(index)}.mp4`, scenes: twoScenes }));
    expect(copyOf(again.fileId)).toBe(false);
    expect(more.map((answer) => copyOf(answer.fileId))).toEqual(Array.from({ length: 10 }, () => true));
  });

  it('M5.4-E1 an image without a length fails before ffmpeg runs', async () => {
    const { kernel, ffmpeg } = await composing();
    expect(await problemOf(kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: [{ clip: 'v/title.png' }] }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runsOf(ffmpeg)).toEqual([]);
  });

  it('M5.4-E3 missing or wrong files fail before ffmpeg runs', async () => {
    const world = await composing();
    world.write('v/anim.gif', 'gif');
    world.write('v/n.ogg', 'ogg');
    world.write('taken.mp4', 'old');
    const attempt = (input: Record<string, unknown>) => problemOf(world.kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: [{ clip: 'v/01.mp4' }], ...input }));
    expect(await attempt({ scenes: [{ clip: 'v/none.mp4' }] })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await attempt({ scenes: [{ clip: 'v/anim.gif' }] })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await attempt({ scenes: [{ clip: 'v/01.mp4', narration: 'v/n.ogg' }] })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await attempt({ file: 'x.mov' })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await attempt({ file: 'taken.mp4' })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await attempt({ scenes: [{ clip: '../outside.mp4' }] })).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runsOf(world.ffmpeg)).toEqual([]);
  });

  it('M5.4-E5 a failed scene or join fails RENDER_FAILED; nothing is written; the work folder is gone', async () => {
    const scene = await composing('part-2.mp4');
    expect(await problemOf(scene.kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: twoScenes }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { scene: 2, reason: 'Conversion failed!' } });
    expect(existsSync(`${scene.workspace}/x.mp4`)).toBe(false);
    const join = await composing('join');
    expect(await problemOf(join.kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: twoScenes }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { scene: null, reason: 'Conversion failed!' } });
    expect(existsSync(`${join.workspace}/x.mp4`)).toBe(false);
    expect([...workFoldersLeft(scene.ffmpeg), ...workFoldersLeft(join.ffmpeg)]).toEqual([]);
  });

  it("M5.4-E6 ffprobe that can't read a clip fails RENDER_FAILED with its scene", async () => {
    const world = await composing();
    world.write('v/unreadable.mp4', 'junk');
    expect(await problemOf(world.kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: [{ clip: 'v/01.mp4' }, { clip: 'v/unreadable.mp4' }] }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { scene: 2, reason: 'Invalid data found when processing input' } });
  });

  it('M5.4-E7 cancel stops ffmpeg, writes nothing, and removes the work folder', async () => {
    const ffmpeg = programs.program('ffmpeg', "fs.writeFileSync(__filename + '.pid', JSON.stringify({ pid: process.pid, cwd: process.cwd() })); setInterval(() => {}, 1000);");
    const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': programs.program('ffprobe', probesLengths) } });
    world.write('v/01.mp4', 'video');
    const jobId = await world.kernel.execAsync('kvvideo.video.compose', { file: 'x.mp4', scenes: [{ clip: 'v/01.mp4' }] });
    await expect.poll(() => existsSync(`${ffmpeg}.pid`), { timeout: 20_000 }).toBe(true);
    const { pid, cwd } = JSON.parse(readFileSync(`${ffmpeg}.pid`, 'utf8')) as { pid: number; cwd: string };
    world.kernel.cancel(jobId);
    expect((await world.kernel.waitForJob(jobId)).status).toBe('cancelled');
    const alive = (): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await expect.poll(alive, { timeout: 5_000 }).toBe(false);
    expect(existsSync(`${world.workspace}/x.mp4`)).toBe(false);
    expect(existsSync(cwd)).toBe(false);
  });
});

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();
const outside: string[] = [];
afterEach(() => {
  for (const folder of outside.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// ffprobe: a 4 s video of 640 × 360 with sound; ffmpeg: the analysis prints nothing, a sheet writes a JPEG's bytes.
const ffprobe = "if (args.includes('stream=width,height')) console.log('640x360'); else if (args.includes('stream=index')) console.log('1'); else console.log('4.0');";
const ffmpeg = "const output = args[args.length - 1]; if (output !== '-') fs.writeFileSync(output, 'JPEG');";

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

async function reviewing() {
  const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': programs.program('ffmpeg', ffmpeg), 'kvvideo.programs.ffprobe': programs.program('ffprobe', ffprobe) } });
  world.write('v.mp4', 'video');
  return world;
}

describe('video review (16 §16.10, ADR 0115, 48)', { timeout: 120_000 }, () => {
  it("M5.9-H7 the connector's review lets the model see its images", async () => {
    const { kernel } = await kvvideo.start();
    const video = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'video');
    expect(video?.commands?.find((command) => command.name === 'review')).toMatchObject({ command: 'kvvideo.video.review', images: true });
  });

  it('M5.9-H8 the newest 24 sheets are kept, the oldest deleted with their files', async () => {
    const { kernel } = await reviewing();
    const ids: string[] = [];
    for (let index = 0; index < 26; index += 1) ids.push(...(await kernel.exec('kvvideo.video.review', { file: 'v.mp4' })).images.map((image) => image.fileId));
    expect(ids).toHaveLength(26);
    expect(ids.map((id) => existsSync(`${kernel.home}/files/${id}`))).toEqual([false, false, ...Array.from({ length: 24 }, () => true)]);
  });

  it("M5.9-E5 a file that isn't an MP4, doesn't exist, or is outside the workspace", async () => {
    const { kernel, write, workspace } = await reviewing();
    write('notes.txt', 'x');
    const away = mkdtempSync(path.join(tmpdir(), 'kvvideo-away-'));
    outside.push(away);
    writeFileSync(path.join(away, 'v.mp4'), 'video');
    const codes = [];
    for (const file of ['notes.txt', 'missing.mp4', path.relative(workspace, path.join(away, 'v.mp4'))]) codes.push(((await problemOf(kernel.exec('kvvideo.video.review', { file }))) as { code: string }).code);
    expect(codes).toEqual(['VALIDATION_FAILED', 'NOT_FOUND', 'VALIDATION_FAILED']);
  });
});

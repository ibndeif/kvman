import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { mixed } from '../src/compose/background.ts';
import { composes, probesLengths, useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo, type KvvideoWorld } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

type Run = { args: string[]; files: string[]; graph: string | null; ass: string | null };
const runsOf = (ffmpeg: string): Run[] => (existsSync(`${ffmpeg}.log`) ? readFileSync(`${ffmpeg}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Run) : []);
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

const recording = { kind: 'site', source: 'http://localhost/', width: 640, height: 360, device: 'desktop', scale: 2, durationMs: 4000, steps: [], actions: [{ do: 'wait', atMs: 500, endMs: 900 }, { do: 'click', atMs: 900, actMs: 1500, endMs: 1550, box: { x: 10, y: 10, width: 50, height: 20 } }] };

async function composing(settings: Record<string, unknown> = {}): Promise<KvvideoWorld & { ffmpeg: string }> {
  const ffmpeg = programs.program('ffmpeg', composes());
  const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': programs.program('ffprobe', probesLengths), 'kvvideo.browser': 'msedge', ...settings } as never });
  world.write('v/title.png', 'image');
  world.write('v/01.mp4', 'video');
  world.write('v/01.mp3', 'audio');
  return { ...world, ffmpeg };
}

describe("compose's look (16 §16.8, ADR 0115)", { timeout: 60_000 }, () => {
  it("M5.7-H10 a scene's captions from its narration's sidecar, in the brand's font", async () => {
    const { kernel, ffmpeg, write } = await composing({ 'kvvideo.brand': { logo: null, colors: { primary: '#2563EB', background: '#FFFFFF', text: '#111111' }, font: 'Lato' } });
    write('v/01.mp3.kvvideo.json', JSON.stringify({ kind: 'narration', durationMs: 2500, captions: [{ text: 'Open the app.', startMs: 0, endMs: 1250 }, { text: 'Sign in.', startMs: 1250, endMs: 2500 }] }));
    await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: [{ clip: 'v/title.png', narration: 'v/01.mp3' }] });
    const ass = runsOf(ffmpeg)[0]?.ass ?? '';
    expect(ass).toContain('Style: Default,Lato,60,');
    expect(ass.split('\n').filter((line) => line.startsWith('Dialogue:')).map((line) => line.split(',,0,0,0,,')[1])).toEqual(['Open the app.', 'Sign in.']);
    expect(runsOf(ffmpeg)[0]?.args).toContain(`gradients=s=1920x1080:r=60:c0=0xFFFFFF:c1=0x${mixed('#FFFFFF', '#2563EB', 0.18).slice(1)}:x0=0:y0=0:x1=1920:y1=1080:n=2:speed=0`);
  });

  it('M5.7-H13 the default size is 1920 × 1080, and the graph is a file in the work folder', async () => {
    const { kernel, ffmpeg } = await composing();
    await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: [{ clip: 'v/title.png', durationMs: 1000 }] });
    const [part] = runsOf(ffmpeg);
    expect(part?.args.slice(part.args.indexOf('-filter_complex_script'), part.args.indexOf('-filter_complex_script') + 2)).toEqual(['-filter_complex_script', 'scene-1.graph']);
    expect(part?.files).toContain('scene-1.graph');
    expect(part?.graph).toContain('[moved]scale=1920:1080:force_original_aspect_ratio=decrease[fit]');
    expect(part?.graph).toContain("perspective=x0='clip(");
  });

  it('M5.7-E1 M5.7-E2 an overlay on a step without a box, past the recording, or on a clip without one fails before ffmpeg runs', async () => {
    const { kernel, ffmpeg, write } = await composing();
    write('v/01.mp4.kvvideo.json', JSON.stringify(recording));
    write('v/plain.mp4', 'video');
    const attempts = [
      { clip: 'v/01.mp4', overlays: [{ kind: 'blur', step: 1, fromMs: 0, toMs: 100 }] },
      { clip: 'v/01.mp4', overlays: [{ kind: 'blur', step: 3, fromMs: 0, toMs: 100 }] },
      { clip: 'v/plain.mp4', overlays: [{ kind: 'blur', step: 1, fromMs: 0, toMs: 100 }] },
    ];
    for (const scene of attempts) expect(await problemOf(kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: [scene as never] }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runsOf(ffmpeg)).toEqual([]);
  });

  it('M5.7-E4 captions off write no ASS file and no subtitles', async () => {
    const { kernel, ffmpeg } = await composing();
    await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', captions: { style: 'off' }, scenes: [{ clip: 'v/title.png', durationMs: 1000, captions: [{ text: 'Hi.', startMs: 0, endMs: 1000 }] }] });
    const [part] = runsOf(ffmpeg);
    expect([part?.ass, part?.graph?.includes('subtitles')]).toEqual([null, false]);
    expect(part?.files.some((file) => file.endsWith('.ass'))).toBe(false);
  });

  it('M5.7-E7 a background outside the workspace, of another kind, or not a colour fails', async () => {
    const { kernel, ffmpeg, write } = await composing();
    write('bg.gif', 'gif');
    for (const background of ['../bg.png', 'bg.gif', '#12345']) {
      expect(await problemOf(kernel.exec('kvvideo.video.compose', { file: 'a.mp4', scenes: [{ clip: 'v/title.png', durationMs: 1000, background }] }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(runsOf(ffmpeg)).toEqual([]);
  });
});

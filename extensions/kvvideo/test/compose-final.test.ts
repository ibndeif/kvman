import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { registerCompose } from '../src/compose/register-compose.ts';
import { composes, probesLengths, useFakePrograms } from './support/fake-programs.ts';
import { useKvvideo, type KvvideoWorld } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();

type Run = { kind: string; args: string[]; cwd: string; graph: string | null };
const runsOf = (ffmpeg: string): Run[] => (existsSync(`${ffmpeg}.log`) ? readFileSync(`${ffmpeg}.log`, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Run) : []);
const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

async function composing(fail = ''): Promise<KvvideoWorld & { ffmpeg: string }> {
  const ffmpeg = programs.program('ffmpeg', composes(fail));
  const world = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': programs.program('ffprobe', probesLengths) } });
  world.write('v/a.png', 'image');
  world.write('v/b.png', 'image');
  world.write('v/n.mp3', 'audio');
  return { ...world, ffmpeg };
}

const captioned = [
  { clip: 'v/a.png', narration: 'v/n.mp3', captions: [{ text: 'Open the app.', startMs: 0, endMs: 2500 }] },
  { clip: 'v/b.png', narration: 'v/n.mp3', captions: [{ text: 'Sign in.', startMs: 0, endMs: 2500 }] },
];

describe("compose's final pass (16 §16.8, ADR 0115)", { timeout: 60_000 }, () => {
  it('M5.8-H8 the .srt, poster, and sidecar beside the video; progress for each part and the final pass', async () => {
    const { kernel, ffmpeg, workspace } = await composing();
    const chunks: { data: { key: string; params: Record<string, number> } }[] = [];
    const answer = await kernel.exec('kvvideo.video.compose', { file: 'v/tour.mp4', scenes: captioned }, { onProgress: (chunk) => chunks.push(chunk as never) });
    expect(answer.durationMs).toBe(3100 + 3100 - 500);
    expect(readFileSync(`${workspace}/v/tour.srt`, 'utf8')).toBe('1\n00:00:00,300 --> 00:00:02,800\nOpen the app.\n\n2\n00:00:02,900 --> 00:00:05,400\nSign in.\n');
    expect(readFileSync(`${workspace}/v/tour.jpg`, 'utf8')).toBe('POSTER');
    expect(JSON.parse(readFileSync(`${workspace}/v/tour.mp4.kvvideo.json`, 'utf8'))).toMatchObject({ kind: 'video', durationMs: 5700, width: 1920, height: 1080, scenes: [{ startMs: 0, endMs: 3100 }, { startMs: 2600, endMs: 5700 }] });
    const final = runsOf(ffmpeg).find((run) => run.kind === 'final');
    expect(final?.graph).toContain('xfade=transition=fade:duration=0.500:offset=2.600');
    expect(final?.graph).toContain('measured_I=-20.00');
    expect(chunks.map((chunk) => chunk.data.key)).toEqual(['kvvideo.progress.scene', 'kvvideo.progress.scene', 'kvvideo.progress.final']);
    expect(chunks[1]?.data.params).toEqual({ n: 2, of: 2 });
  });

  it('M5.8-H10 an extra size is composed again at its own size, beside the main one', async () => {
    const { kernel, ffmpeg, workspace } = await composing();
    const answer = await kernel.exec('kvvideo.video.compose', { file: 'v/tour.mp4', extraSizes: [{ width: 1080, height: 1920 }], scenes: captioned });
    expect(answer.others).toEqual([{ file: 'v/tour-1080x1920.mp4', bytes: 'PART part-1.mkv\nPART part-2.mkv\n'.length }]);
    expect(['v/tour-1080x1920.mp4', 'v/tour-1080x1920.srt', 'v/tour-1080x1920.jpg'].map((file) => existsSync(`${workspace}/${file}`))).toEqual([true, true, true]);
    const parts = runsOf(ffmpeg).filter((run) => run.kind === 'part');
    expect(parts.map((run) => run.args.find((arg) => arg.startsWith('gradients=s='))?.split(':')[0])).toEqual(['gradients=s=1920x1080', 'gradients=s=1920x1080', 'gradients=s=1080x1920', 'gradients=s=1080x1920']);
    expect(new Set(parts.map((run) => run.cwd)).size).toBe(2);
  });

  it('M5.8-E1 M5.8-E2 a transition too long, on the last scene, or repeated extra sizes fail before ffmpeg runs', async () => {
    const { kernel, ffmpeg } = await composing();
    const attempts = [
      { scenes: [{ clip: 'v/a.png', durationMs: 3000, transition: { kind: 'crossfade', ms: 1600 } }, { clip: 'v/b.png', durationMs: 3000 }] },
      { scenes: [{ clip: 'v/a.png', durationMs: 3000 }, { clip: 'v/b.png', durationMs: 3000, transition: { kind: 'cut' } }] },
      { scenes: [{ clip: 'v/a.png', durationMs: 3000, transition: { kind: 'crossfade', ms: 2001 } }, { clip: 'v/b.png', durationMs: 5000 }] },
      { scenes: [{ clip: 'v/a.png', durationMs: 3000 }], extraSizes: [{ width: 1920, height: 1080 }] },
      { scenes: [{ clip: 'v/a.png', durationMs: 3000 }], extraSizes: [{ width: 1080, height: 1080 }, { width: 1080, height: 1080 }] },
      { scenes: [{ clip: 'v/a.png', durationMs: 3000 }], extraSizes: [{ width: 1080, height: 1080 }, { width: 1080, height: 1920 }, { width: 720, height: 720 }] },
    ];
    for (const attempt of attempts) expect(await problemOf(kernel.exec('kvvideo.video.compose', { file: 'x.mp4', ...attempt } as never))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(runsOf(ffmpeg)).toEqual([]);
  });

  it('M5.8-E3 a failed measure or final encode fails RENDER_FAILED with no scene; nothing is written beside', async () => {
    for (const fail of ['measure', 'final']) {
      const { kernel, workspace } = await composing(fail);
      expect(await problemOf(kernel.exec('kvvideo.video.compose', { file: 'x.mp4', scenes: captioned }))).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { scene: null, reason: 'Conversion failed!' } });
      expect(['x.mp4', 'x.srt', 'x.jpg', 'x.mp4.kvvideo.json'].filter((file) => existsSync(`${workspace}/${file}`))).toEqual([]);
    }
  });

  it('M5.8-E5 one scene with captions off: no .srt and no transition', async () => {
    const { kernel, ffmpeg, workspace } = await composing();
    await kernel.exec('kvvideo.video.compose', { file: 'one.mp4', captions: { style: 'off' }, scenes: [captioned[0] ?? { clip: 'v/a.png' }] });
    expect(existsSync(`${workspace}/one.srt`)).toBe(false);
    expect(runsOf(ffmpeg).find((run) => run.kind === 'final')?.graph).not.toContain('xfade');
  });

  it('M5.8-E6 compose has 60 minutes', () => {
    const registered = new Map<string, { timeoutMs?: number }>();
    const ctx = { registerCommand: (name: string, definition: { timeoutMs?: number }) => registered.set(name, definition) } as unknown as Ctx;
    registerCompose(ctx);
    expect(registered.get('kvvideo.video.compose')?.timeoutMs).toBe(3_600_000);
  });

  it("M5.8-E7 a recorded page's sidecar naming a page outside the workspace, or a goto, fails before anything is recorded", async () => {
    const { kernel, ffmpeg, write } = await composing();
    const page = (source: string, steps: unknown[]) => JSON.stringify({ kind: 'page', source, width: 640, height: 360, device: 'desktop', scale: 2, durationMs: 1000, steps, actions: [] });
    for (const [name, sidecar] of [['out', page('../../../etc/passwd.html', [])], ['away', page('/etc/hosts', [])], ['goto', page('p.html', [{ do: 'goto', url: 'http://localhost:1/' }])]] as const) {
      write(`v/${name}.mp4`, 'video');
      write(`v/${name}.mp4.kvvideo.json`, sidecar);
      write('p.html', '<p>x</p>');
      const problem = await problemOf(kernel.exec('kvvideo.video.compose', { file: `${name}.mp4`, width: 640, height: 360, extraSizes: [{ width: 360, height: 640 }], scenes: [{ clip: `v/${name}.mp4` }] }));
      expect(problem).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(runsOf(ffmpeg).filter((run) => run.kind !== 'part' && run.cwd.endsWith('size-2'))).toEqual([]);
  });
});

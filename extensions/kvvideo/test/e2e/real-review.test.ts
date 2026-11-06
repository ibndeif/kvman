import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// A real review (plan 16 §16.10; ADR 0115, 20 and 48; ADR 0120, 23) with the ffmpeg on the PATH: a video with a black
// second and a silent end longer than an end card's 5 s, and one without sound.

const kvvideo = useKvvideo();

const size = (file: string): string => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file], { encoding: 'utf8' }).trim();

describe('a real review (16 §16.10, ADR 0115)', () => {
  it('M5.9-H6 M5.11-H3 the black picture and the silence found, and sheets of the frames the model sees, a frame each 5 s without a sidecar', async () => {
    const { kernel, workspace } = await kvvideo.start();
    const colour = (name: string, seconds: number) => ['-f', 'lavfi', '-i', `color=c=${name}:s=640x360:d=${String(seconds)}:r=30`];
    execFileSync('ffmpeg', ['-v', 'error', ...colour('red', 2), ...colour('black', 1), ...colour('red', 6), '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=6', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a]concat=n=2:v=0:a=1[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', `${workspace}/look.mp4`]);
    const chunks: unknown[] = [];
    const answer = await kernel.exec('kvvideo.video.review', { file: 'look.mp4' }, { onProgress: (chunk) => chunks.push(chunk) });
    const black = answer.problems.find((problem) => problem.kind === 'black');
    expect(Math.abs((black?.atMs ?? 0) - 2000)).toBeLessThan(100);
    expect(answer.problems.some((problem) => problem.kind === 'silence' && Math.abs(problem.atMs - 3000) < 200)).toBe(true);
    expect(answer.loudness).not.toBeNull();
    expect(answer.images).toEqual([{ fileId: expect.any(String), name: 'review-1.jpg' }]);
    const sheet = `${kernel.home}/files/${answer.images[0]?.fileId ?? ''}`;
    expect(existsSync(sheet)).toBe(true);
    expect(size(sheet)).toBe('960x270');
    expect(chunks).toEqual([{ source: '@kvman/kvvideo', data: { key: 'kvvideo.progress.sheet', params: { n: 1, of: 1 } } }]);
  });

  it('M5.9-E6 a video without sound has no loudness and no silence', async () => {
    const { kernel, workspace } = await kvvideo.start();
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', `${workspace}/mute.mp4`]);
    const answer = await kernel.exec('kvvideo.video.review', { file: 'mute.mp4' });
    expect(answer.loudness).toBeNull();
    expect(answer.problems.filter((problem) => problem.kind === 'silence' || problem.kind === 'loudness')).toEqual([]);
  });
});

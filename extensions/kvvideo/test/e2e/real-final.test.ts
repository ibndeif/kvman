import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// A real final pass (plan 16 §16.8, ADR 0115, 2, 12, 19, 37, and 44) with the ffmpeg on the PATH: its length, its
// loudness, a slide between two scenes, and a page recorded again for another shape, read back from the videos.

const kvvideo = useKvvideo();

function pixel(file: string, seconds: number, x: number, y: number): number[] {
  return [...execFileSync('ffmpeg', ['-v', 'error', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${String(x)}:${String(y)}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
}

function loudness(file: string): { integrated: number; peak: number } {
  const output = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const summary = output.slice(output.lastIndexOf('Summary:'));
  return { integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]) };
}

const duration = (file: string): number => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })) * 1000;

const reddish = (rgb: number[]): boolean => (rgb[0] ?? 0) > 180 && (rgb[2] ?? 0) < 90;
const bluish = (rgb: number[]): boolean => (rgb[2] ?? 0) > 180 && (rgb[0] ?? 0) < 90;

describe('a real final pass (16 §16.8, ADR 0115)', () => {
  it('M5.8-H13 a slide, the sound levelled to −14 LUFS, and the length the answer says', async () => {
    const { kernel, workspace } = await kvvideo.start();
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x360', '-frames:v', '1', '-y', `${workspace}/a.png`]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360', '-frames:v', '1', '-y', `${workspace}/b.png`]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-af', 'volume=-20dB', '-y', `${workspace}/n.wav`]);
    const answer = await kernel.exec('kvvideo.video.compose', { file: 'final.mp4', width: 640, height: 360, scenes: [{ clip: 'a.png', narration: 'n.wav', transition: { kind: 'slide', ms: 600 } }, { clip: 'b.png', durationMs: 2000 }] });
    expect(answer.durationMs).toBe(4000);
    const file = `${workspace}/final.mp4`;
    expect(Math.abs(duration(file) - 4000)).toBeLessThan(100);
    const level = loudness(file);
    expect(Math.abs(level.integrated + 14)).toBeLessThanOrEqual(1);
    expect(level.peak).toBeLessThan(-0.5);
    const middle = (2000 + 300) / 1000;
    expect([reddish(pixel(file, middle, 160, 180)), bluish(pixel(file, middle, 480, 180))]).toEqual([true, true]);
    expect(existsSync(`${workspace}/final.jpg`)).toBe(true);
    expect(existsSync(`${workspace}/final.mp4.kvvideo.json`)).toBe(true);
  });

  it('M5.8-H11 a page is recorded again for a size of another shape', async () => {
    const { kernel, workspace, write } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    write('page/shape.html', '<!doctype html><html><head><style>html,body{margin:0;height:100%;background:red}@media (orientation: portrait){html,body{background:#00ff00}}</style></head><body></body></html>');
    await kernel.exec('kvvideo.clip.record', { page: 'page/shape.html', file: 'page/shape.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 500 }] });
    const answer = await kernel.exec('kvvideo.video.compose', { file: 'shape.mp4', width: 640, height: 360, extraSizes: [{ width: 360, height: 640 }], scenes: [{ clip: 'page/shape.mp4' }] });
    expect(answer.others).toEqual([{ file: 'shape-360x640.mp4', bytes: expect.any(Number) }]);
    expect(reddish(pixel(`${workspace}/shape.mp4`, 0.5, 320, 180))).toBe(true);
    const portrait = pixel(`${workspace}/shape-360x640.mp4`, 0.5, 180, 320);
    expect((portrait[1] ?? 0) > 180 && (portrait[0] ?? 0) < 90).toBe(true);
    expect(existsSync(`${workspace}/shape-360x640.jpg`)).toBe(true);
  });
});

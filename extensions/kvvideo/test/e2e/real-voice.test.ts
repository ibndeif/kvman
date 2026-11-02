import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// A real voice (plan 16 §16.7; ADR 0115, 28 and 50) with the ffmpeg on the PATH: two takes of a second of tone between
// a second of silence on each side are trimmed, evened, and joined.

const kvvideo = useKvvideo();

describe('a real voice (16 §16.7, ADR 0115)', () => {
  it('M5.10-H9 the silences trimmed to 150 ms, and each caption starting with its take', async () => {
    const { kernel, workspace } = await kvvideo.start();
    for (const name of ['line-1.wav', 'line-2.wav']) {
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,2),0.5*sin(2*PI*440*t),0)':d=3:s=48000", '-ac', '1', '-y', `${workspace}/${name}`]);
    }
    const answer = await kernel.exec('kvvideo.voice.make', { lines: [{ take: 'line-1.wav', text: 'One.' }, { take: 'line-2.wav', text: 'Two.' }], file: 'voice.mp3' });
    expect(answer.durationMs).toBeGreaterThan(2400);
    expect(answer.durationMs).toBeLessThan(3400);
    const second = answer.captions[1]?.startMs ?? 0;
    expect(second).toBeGreaterThan(1300);
    expect(second).toBeLessThan(1900);
    expect(answer.captions[1]?.endMs).toBe(answer.durationMs);
  });
});

import { describe, expect, it } from 'vitest';
import { cleanFilter, takeArgs } from '../../src/narration/voice-args.ts';

describe("a take's cleaning (16 §16.7, ADR 0115, 28 and 50)", () => {
  it('M5.10-H8 rumble, noise, silence at both ends, and the level; or only converted', () => {
    expect(cleanFilter).toBe('highpass=f=80,afftdn=nr=12:nf=-30,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100');
    expect(takeArgs('/w/line-1.webm', true, 'take-1.wav')).toEqual(['-hide_banner', '-loglevel', 'error', '-i', '/w/line-1.webm', '-vn', '-af', cleanFilter, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-y', 'take-1.wav']);
    expect(takeArgs('/w/line-1.webm', false, 'take-1.wav')).not.toContain('-af');
  });
});

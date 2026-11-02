import { describe, expect, it } from 'vitest';
import { joinNarrationArgs } from '../../src/narration/join-args.ts';

describe("a narration's join (16 §16.6, ADR 0115, 41)", () => {
  it('M5.6-H2 the sentences, alike in sound, with 250 ms between them, as MP3 at 192k', () => {
    expect(joinNarrationArgs(['s1.wav', 's2.mp3', 's3.mp3'], 'out.mp3')).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-i', 's1.wav', '-i', 's2.mp3', '-i', 's3.mp3',
      '-filter_complex',
      '[0:a]aformat=sample_rates=44100:channel_layouts=mono,apad=pad_dur=0.25[s0];[1:a]aformat=sample_rates=44100:channel_layouts=mono,apad=pad_dur=0.25[s1];[2:a]aformat=sample_rates=44100:channel_layouts=mono[s2];[s0][s1][s2]concat=n=3:v=0:a=1[out]',
      '-map', '[out]',
      '-codec:a', 'libmp3lame', '-b:a', '192k',
      '-y', 'out.mp3',
    ]);
    expect(joinNarrationArgs(['only.mp3'], 'out.mp3')).toContain('[0:a]aformat=sample_rates=44100:channel_layouts=mono[s0];[s0]concat=n=1:v=0:a=1[out]');
  });
});

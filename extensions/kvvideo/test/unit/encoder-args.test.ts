import { describe, expect, it } from 'vitest';
import { recordEncoderArgs } from '../../src/record/encoder-args.ts';

describe("ffmpeg's arguments for a recording (16 §16.5, ADR 0107, 25)", () => {
  it('M5.2-H7 JPEGs from stdin at 30 a second to H.264 of the size, without sound', () => {
    expect(recordEncoderArgs(640, 360, '/work/recording.mp4')).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30',
      '-an', '-movflags', '+faststart', '-y', '/work/recording.mp4',
    ]);
  });
});

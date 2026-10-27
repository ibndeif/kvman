import { framesPerSecond } from './frame-writer.ts';

/** ffmpeg's arguments for a recording's frames, JPEGs on stdin, to an H.264 file of the size (ADR 0107, 25). */
export function recordEncoderArgs(width: number, height: number, output: string): string[] {
  const fit = `scale=${String(width)}:${String(height)}:force_original_aspect_ratio=decrease,pad=${String(width)}:${String(height)}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
  return [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(framesPerSecond), '-c:v', 'mjpeg', '-i', '-',
    '-vf', fit,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', String(framesPerSecond),
    '-an', '-movflags', '+faststart', '-y', output,
  ];
}

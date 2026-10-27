import { describe, expect, it } from 'vitest';
import { joinArgs, joinList, sceneArgs } from '../../src/compose/scene-args.ts';
import type { PlannedScene } from '../../src/compose/scene-plan.ts';

const size = { width: 1280, height: 720 };
const encode = ['-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2'];
const fit = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p';

describe("each scene's ffmpeg arguments (16 §16.7, ADR 0107, 23)", () => {
  it('M5.4-H2 a video part with a narration and captions, and an image with silence', () => {
    const narrated: PlannedScene = { number: 1, kind: 'video', clip: 'C:\\Users\\O\'Brien\\clip.mp4', startMs: 2000, partMs: 3000, lengthMs: 4200, narration: '/w/n.mp3', captions: [{ text: 'Hi.', startMs: 0, endMs: 4200 }] };
    expect(sceneArgs(narrated, size, 'part-1.mp4')).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-ss', '2.000', '-t', '3.000', '-i', "C:\\Users\\O'Brien\\clip.mp4",
      '-i', '/w/n.mp3',
      '-filter_complex', `[0:v]${fit},tpad=stop_mode=clone:stop_duration=4.200,subtitles=filename=scene-1.ass:fontsdir=fonts[v];[1:a]aresample=48000,apad[a]`,
      ...encode, '-t', '4.200', '-y', 'part-1.mp4',
    ]);
    const still: PlannedScene = { number: 2, kind: 'image', clip: '/w/title.png', startMs: 0, partMs: 0, lengthMs: 3000, narration: undefined, captions: [] };
    expect(sceneArgs(still, size, 'part-2.mp4')).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-loop', '1', '-framerate', '30', '-t', '3.000', '-i', '/w/title.png',
      '-f', 'lavfi', '-t', '3.000', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-filter_complex', `[0:v]${fit},tpad=stop_mode=clone:stop_duration=3.000[v];[1:a]aresample=48000,apad[a]`,
      ...encode, '-t', '3.000', '-y', 'part-2.mp4',
    ]);
  });

  it('M5.4-E11 the subtitles filter names its files relative to the work folder, never a path', () => {
    const scene: PlannedScene = { number: 3, kind: 'video', clip: '/w/a.mp4', startMs: 0, partMs: 1000, lengthMs: 1000, narration: undefined, captions: [{ text: 'x', startMs: 0, endMs: 1000 }] };
    const graph = sceneArgs(scene, size, 'part-3.mp4')[sceneArgs(scene, size, 'part-3.mp4').indexOf('-filter_complex') + 1] ?? '';
    expect(graph).toContain('subtitles=filename=scene-3.ass:fontsdir=fonts[v]');
  });

  it('M5.4-H3 the join lists the parts in order and copies them', () => {
    expect(joinList(['part-1.mp4', 'part-2.mp4', "it's.mp4"])).toBe("file 'part-1.mp4'\nfile 'part-2.mp4'\nfile 'it'\\''s.mp4'\n");
    expect(joinArgs('parts.txt', 'video.mp4')).toEqual(['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'parts.txt', '-c', 'copy', '-movflags', '+faststart', '-y', 'video.mp4']);
  });
});

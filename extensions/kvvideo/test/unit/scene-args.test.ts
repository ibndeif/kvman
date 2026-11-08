import { describe, expect, it } from 'vitest';
import { sceneArgs, type SceneRender } from '../../src/compose/scene-args.ts';
import type { PlannedScene } from '../../src/compose/scene-plan.ts';

const size = { width: 1280, height: 720 };
const encode = ['-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '60', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2'];
const gradient = { kind: 'gradient' as const, from: '#0F172A', to: '#1E293B' };
const plain = (scene: PlannedScene, captioned: boolean): SceneRender => ({ scene, look: { frame: 'none', camera: undefined, overlays: [], scale: 1 }, background: gradient, drawn: { layout: undefined, chrome: undefined, mask: undefined, overlayImages: [] }, captioned });

describe("each scene's ffmpeg arguments (16 §16.8; ADR 0107, 23; ADR 0115, 60)", () => {
  it('M5.4-H2 M5.7-H13 M5.8-H1 a video part with a narration and captions, and an image with silence, each from its graph file', () => {
    const narrated: PlannedScene = { number: 1, kind: 'video', clip: "C:\\Users\\O'Brien\\clip.mp4", startMs: 2000, partMs: 3000, lengthMs: 4200, narration: '/w/n.mp3' };
    const { args, graph } = sceneArgs(plain(narrated, true), size, 'part-1.mkv');
    expect(args).toEqual([
      '-hide_banner', '-loglevel', 'error',
      '-ss', '2.000', '-t', '3.000', '-i', "C:\\Users\\O'Brien\\clip.mp4",
      '-i', '/w/n.mp3',
      '-f', 'lavfi', '-t', '4.200', '-i', 'gradients=s=1280x720:r=60:c0=0x0F172A:c1=0x1E293B:x0=0:y0=0:x1=1280:y1=720:n=2,trim=end_frame=1,loop=loop=-1:size=1',
      '-filter_complex_script', 'scene-1.graph',
      ...encode, '-t', '4.200', '-y', 'part-1.mkv',
    ]);
    expect(graph.split(';\n')).toEqual([
      '[0:v]fps=60,tpad=stop_mode=clone:stop_duration=4.200[clip]',
      '[2:v]fps=60,format=yuv420p[bg]',
      '[clip]scale=1280:720:force_original_aspect_ratio=decrease[fit]',
      '[bg][fit]overlay=(W-w)/2:(H-h)/2[pic]',
      '[pic]format=yuv420p,subtitles=filename=scene-1.ass:fontsdir=fonts[v]',
      '[1:a]adelay=delays=300:all=1,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:4.200,afade=t=in:d=0.02,afade=t=out:st=4.180:d=0.02[a]',
    ]);
    const still: PlannedScene = { number: 2, kind: 'image', clip: '/w/title.png', startMs: 0, partMs: 0, lengthMs: 3000, narration: undefined };
    const image = sceneArgs(plain(still, false), size, 'part-2.mp4');
    expect(image.args.slice(3, 14)).toEqual(['-loop', '1', '-framerate', '60', '-t', '3.000', '-i', '/w/title.png', '-f', 'lavfi', '-t']);
    expect(image.graph).toContain('[pic]format=yuv420p[v]');
    expect(image.graph).toContain('[1:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:3.000,');
  });

  it('M5.7-H5 a window: the chrome under the clip, the mask on it, at its place; the camera before it', () => {
    const scene: PlannedScene = { number: 3, kind: 'video', clip: '/w/a.mp4', startMs: 0, partMs: 1000, lengthMs: 1000, narration: undefined };
    const layout = { kind: 'window' as const, screen: { x: 77, y: 65, width: 1126, height: 634 }, radius: 11, shadow: { offset: 14, blur: 36 } };
    const render: SceneRender = {
      scene,
      look: { frame: 'window', camera: { plan: { width: 640, height: 360, start: { x: 320, y: 180, zoom: 1 }, shots: [] }, scale: 2, offsetMs: 0 }, overlays: [{ kind: 'callout', box: { x: 0, y: 0, width: 10, height: 10 }, text: 'Hi', fromMs: 0, toMs: 500 }], scale: 2 },
      background: gradient,
      drawn: { layout, chrome: 'scene-3-chrome.png', mask: 'scene-3-mask.png', overlayImages: ['scene-3-overlay-1.png'] },
      captioned: false,
    };
    const { args, graph } = sceneArgs(render, size, 'part-3.mp4');
    expect(args.filter((arg) => arg.endsWith('.png'))).toEqual(['scene-3-chrome.png', 'scene-3-mask.png', 'scene-3-overlay-1.png']);
    const lines = graph.split(';\n');
    expect(lines.findIndex((line) => line.startsWith('[oo0]perspective='))).toBeGreaterThan(lines.findIndex((line) => line.includes('[clip][oi0]overlay')));
    expect(lines).toEqual(expect.arrayContaining(['[moved]scale=1126:634,format=yuva420p[fit]', '[bg][3:v]overlay=0:0[bgc]', '[4:v]format=gray[mask]', '[fit][mask]alphamerge[shaped]', '[bgc][shaped]overlay=77:65[pic]', '[5:v]format=rgba,fade=t=in:st=0.000:d=0.2:alpha=1,fade=t=out:st=0.300:d=0.2:alpha=1[oi0]']));
  });

  it('M5.4-E11 the subtitles filter names its files relative to the work folder, never a path', () => {
    const scene: PlannedScene = { number: 3, kind: 'video', clip: '/w/a.mp4', startMs: 0, partMs: 1000, lengthMs: 1000, narration: undefined };
    expect(sceneArgs(plain(scene, true), size, 'part-3.mp4').graph).toContain('subtitles=filename=scene-3.ass:fontsdir=fonts[v]');
  });


});

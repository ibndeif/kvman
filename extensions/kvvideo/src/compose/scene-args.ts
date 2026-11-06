import { videoFramesPerSecond as framesPerSecond } from './video-rate.ts';
import { narrationLeadMs } from '../record/narration-cues.ts';
import { backgroundFit, backgroundInput, type Background } from './background.ts';
import { perspectiveFilter } from './camera.ts';
import type { Layout, Size } from './frame-layout.ts';
import { overlayFilters, type PlacedOverlay } from './overlays.ts';
import type { SceneLook } from './scene-look.ts';
import type { PlannedScene } from './scene-plan.ts';

// ffmpeg's arguments for each scene's part (plan 16 §16.8; ADR 0107, 23; ADR 0115, 36, 37, and 60), a `.mkv` near
// lossless with PCM sound for the final pass. The clip holds its last frame, takes its overlays on its own pixels, then
// the camera, then sits in its frame on the background; the captions go on last. ffmpeg runs in the work folder and reads the graph from a file there, so the
// scene's ASS file, the fonts folder, and the drawn images are named by their relative paths.

export type { Size } from './frame-layout.ts';

/** What the browser drew for a scene, by file name in the work folder: its frame's images and each overlay's. */
export type SceneDrawn = { layout: Layout | undefined; chrome: string | undefined; mask: string | undefined; overlayImages: (string | undefined)[] };

export type SceneRender = { scene: PlannedScene; look: SceneLook; background: Background; drawn: SceneDrawn; captioned: boolean };

const seconds = (ms: number): string => (ms / 1000).toFixed(3);

const quiet = ['-hide_banner', '-loglevel', 'error'];

const still = (file: string, lengthMs: number): string[] => ['-loop', '1', '-framerate', String(framesPerSecond), '-t', seconds(lengthMs), '-i', file];

function clipInput(scene: PlannedScene): string[] {
  if (scene.kind === 'image') return still(scene.clip, scene.lengthMs);
  return ['-ss', seconds(scene.startMs), '-t', seconds(scene.partMs), '-i', scene.clip];
}

// The scene's sound: its narration 300 ms in, or silence, as long as the scene, with 20 ms fades at both ends.
function soundFilter(scene: PlannedScene): string {
  const delay = scene.narration === undefined ? '' : `adelay=delays=${String(narrationLeadMs)}:all=1,`;
  return `[1:a]${delay}aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${seconds(scene.lengthMs)},afade=t=in:d=0.02,afade=t=out:st=${seconds(Math.max(0, scene.lengthMs - 20))}:d=0.02[a]`;
}

function soundInput(scene: PlannedScene): string[] {
  if (scene.narration !== undefined) return ['-i', scene.narration];
  return ['-f', 'lavfi', '-t', seconds(scene.lengthMs), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
}

/** The ASS file of a scene with captions, relative to the work folder. */
export function assName(scene: PlannedScene): string {
  return `scene-${String(scene.number)}.ass`;
}

/** The filter graph file of a scene, relative to the work folder. */
export function graphName(scene: PlannedScene): string {
  return `scene-${String(scene.number)}.graph`;
}

// The inputs after the clip, the sound, and the background: the frame's chrome and mask, then each overlay's image.
function extraInputs(render: SceneRender): { args: string[]; chrome: number | undefined; mask: number | undefined; overlays: PlacedOverlay[] } {
  const args: string[] = [];
  let next = 3;
  const add = (file: string): number => {
    args.push(...still(file, render.scene.lengthMs));
    next += 1;
    return next - 1;
  };
  const chrome = render.drawn.chrome === undefined ? undefined : add(render.drawn.chrome);
  const mask = render.drawn.mask === undefined ? undefined : add(render.drawn.mask);
  const overlays = render.look.overlays.map((overlay, index): PlacedOverlay => {
    const image = render.drawn.overlayImages[index];
    if (overlay.kind === 'blur' || image === undefined) return { kind: 'blur', fromMs: overlay.fromMs, toMs: overlay.toMs, box: overlay.box };
    return { kind: overlay.kind, fromMs: overlay.fromMs, toMs: overlay.toMs, input: add(image) };
  });
  return { args, chrome, mask, overlays };
}

function framed(render: SceneRender, size: Size, clip: string, inputs: ReturnType<typeof extraInputs>): string[] {
  const { width, height } = size;
  const layout = render.drawn.layout;
  const background = `[2:v]${backgroundFit(render.background, size)}[bg]`;
  if (layout === undefined) {
    return [background, `[${clip}]scale=${String(width)}:${String(height)}:force_original_aspect_ratio=decrease[fit]`, `[bg][fit]overlay=(W-w)/2:(H-h)/2[pic]`];
  }
  const { screen } = layout;
  const filters = [background, `[${clip}]scale=${String(screen.width)}:${String(screen.height)},format=yuva420p[fit]`];
  const under = inputs.chrome === undefined ? 'bg' : 'bgc';
  if (inputs.chrome !== undefined) filters.push(`[bg][${String(inputs.chrome)}:v]overlay=0:0[bgc]`);
  const shaped = inputs.mask === undefined ? 'fit' : 'shaped';
  if (inputs.mask !== undefined) filters.push(`[${String(inputs.mask)}:v]format=gray[mask]`, `[fit][mask]alphamerge[shaped]`);
  filters.push(`[${under}][${shaped}]overlay=${String(screen.x)}:${String(screen.y)}[pic]`);
  return filters;
}

export function sceneGraph(render: SceneRender, size: Size, inputs: ReturnType<typeof extraInputs>): string {
  const { scene, look } = render;
  const hold = `tpad=stop_mode=clone:stop_duration=${seconds(scene.lengthMs)}`;
  const filters = [`[0:v]fps=${String(framesPerSecond)},${hold}[clip]`];
  const marked = overlayFilters('clip', inputs.overlays);
  filters.push(...marked.filters);
  let current = marked.output;
  if (look.camera !== undefined) {
    filters.push(`[${current}]${perspectiveFilter(look.camera.plan, look.camera.scale, look.camera.offsetMs)}[moved]`);
    current = 'moved';
  }
  filters.push(...framed(render, size, current, inputs));
  const captions = render.captioned ? `,subtitles=filename=${assName(scene)}:fontsdir=fonts` : '';
  filters.push(`[pic]format=yuv420p${captions}[v]`, soundFilter(scene));
  return filters.join(';\n');
}

/** ffmpeg's arguments for a scene's part, and its filter graph, to be written at `graphName`. */
export function sceneArgs(render: SceneRender, size: Size, output: string): { args: string[]; graph: string } {
  const inputs = extraInputs(render);
  const { scene } = render;
  const args = [
    ...quiet,
    ...clipInput(scene),
    ...soundInput(scene),
    ...backgroundInput(render.background, size, scene.lengthMs),
    ...inputs.args,
    '-filter_complex_script', graphName(scene),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(framesPerSecond),
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    '-t', seconds(scene.lengthMs), '-y', output,
  ];
  return { args, graph: sceneGraph(render, size, inputs) };
}


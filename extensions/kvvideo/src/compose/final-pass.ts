import path from 'node:path';
import { z } from '@kvman/sdk';
import { kvvideoProblem } from '../problems.ts';
import { soundsFolder, type Sound, type SoundEvent } from './sound-effects.ts';
import { xfadeName, type Transition } from './transitions.ts';
import { videoFramesPerSecond } from './video-rate.ts';

// The final pass (plan 16 §16.8; ADR 0115, 2, 19, and 37): the parts are joined with `xfade` and `acrossfade` (a cut
// with `concat`), the sound effects are mixed in, the loudness is measured with `loudnorm`, and the video is encoded
// once with that measure. The measure reads only the sound.

export type FinalPlan = { parts: readonly string[]; starts: readonly number[]; transitions: readonly Transition[]; direction: 'ltr' | 'rtl'; events: readonly SoundEvent[]; durationMs: number };

const seconds = (ms: number): string => (ms / 1000).toFixed(3);
const target = 'I=-14:TP=-2:LRA=11';
const gains: Record<Sound, string> = { click: '-18dB', keys: '-24dB', whoosh: '-18dB', pop: '-18dB' };
// A crossfade's whoosh, softer than a slide's (ADR 0120, 21).
const softGain = '-26dB';

function soundsUsed(plan: FinalPlan): Sound[] {
  return [...new Set(plan.events.map((event) => event.sound))].sort();
}

/** The final pass's inputs: the parts, then each sound used, the key taps looped. */
export function finalInputs(plan: FinalPlan): string[] {
  return [...plan.parts.flatMap((part) => ['-i', part]), ...soundsUsed(plan).flatMap((sound) => [...(sound === 'keys' ? ['-stream_loop', '-1'] : []), '-i', path.join(soundsFolder, `${sound}.wav`)])];
}

function joined(plan: FinalPlan, media: 'v' | 'a'): string[] {
  const filters: string[] = [];
  let current = `0:${media}`;
  plan.parts.slice(1).forEach((_, index) => {
    const transition = plan.transitions[index];
    const name = transition === undefined ? undefined : xfadeName(transition, plan.direction);
    const next = `j${media}${String(index + 1)}`;
    const input = `${String(index + 1)}:${media}`;
    if (name === undefined || transition === undefined) filters.push(`[${current}][${input}]concat=n=2:v=${media === 'v' ? 1 : 0}:a=${media === 'a' ? 1 : 0}[${next}]`);
    else if (media === 'v') filters.push(`[${current}][${input}]xfade=transition=${name}:duration=${seconds(transition.ms)}:offset=${seconds(plan.starts[index + 1] ?? 0)}[${next}]`);
    else filters.push(`[${current}][${input}]acrossfade=d=${seconds(transition.ms)}:c1=tri:c2=tri[${next}]`);
    current = next;
  });
  return [...filters, media === 'v' ? `[${current}]format=yuv420p[v]` : `[${current}]anull[joineda]`];
}

function effects(plan: FinalPlan): string[] {
  const sounds = soundsUsed(plan);
  const filters: string[] = [];
  const labels: string[] = [];
  sounds.forEach((sound, soundIndex) => {
    const events = plan.events.filter((event) => event.sound === sound);
    const input = `${String(plan.parts.length + soundIndex)}:a`;
    const copies = events.map((_, index) => `${sound}${String(index)}`);
    filters.push(`[${input}]asplit=${String(events.length)}${copies.map((copy) => `[${copy}]`).join('')}`);
    events.forEach((event, index) => {
      const trim = event.untilMs === undefined ? '' : `atrim=0:${seconds(event.untilMs - event.atMs)},asetpts=PTS-STARTPTS,`;
      const label = `e${sound}${String(index)}`;
      filters.push(`[${copies[index] ?? ''}]${trim}aformat=sample_rates=48000:channel_layouts=stereo,adelay=delays=${String(Math.round(event.atMs))}:all=1,volume=${event.soft === true ? softGain : gains[sound]}[${label}]`);
      labels.push(label);
    });
  });
  const mix = labels.length === 0 ? '[joineda]anull[mixed]' : `[joineda]${labels.map((label) => `[${label}]`).join('')}amix=inputs=${String(labels.length + 1)}:duration=first:normalize=0[mixed]`;
  return [...filters, mix];
}

/** The loudness filter: measuring when `measured` is undefined, else applying the measure; silence is left as it is. */
export function loudnessFilter(measured: Loudness | undefined): string {
  if (measured === undefined) return `loudnorm=${target}:print_format=json`;
  if (!Number.isFinite(Number(measured.input_i))) return 'anull';
  return `loudnorm=${target}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
}

/** The final pass's graph: the sound alone to measure, or the picture and the sound to encode. */
export function finalGraph(plan: FinalPlan, measured: Loudness | undefined): string {
  const picture = measured === undefined ? [] : joined(plan, 'v');
  return [...picture, ...joined(plan, 'a'), ...effects(plan), `[mixed]${loudnessFilter(measured)},aresample=48000[a]`].join(';\n');
}

const loudnessSchema = z.object({ input_i: z.string(), input_tp: z.string(), input_lra: z.string(), input_thresh: z.string(), target_offset: z.string() });

/** What `loudnorm` measured. */
export type Loudness = z.output<typeof loudnessSchema>;

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/** The measure in a measuring run's output: its last JSON object; one that isn't there fails the final pass. */
export function measuredLoudness(output: string): Loudness {
  const start = output.lastIndexOf('{');
  const end = output.lastIndexOf('}');
  const text = start === -1 || end < start ? '' : output.slice(start, end + 1);
  const parsed = loudnessSchema.safeParse(text === '' ? undefined : parsedJson(text));
  if (!parsed.success) throw kvvideoProblem('RENDER_FAILED', "ffmpeg's loudness measure couldn't be read", { scene: null, reason: "ffmpeg's loudness measure couldn't be read" });
  return parsed.data;
}

const quiet = ['-hide_banner', '-loglevel', 'error'];

export function measureArgs(plan: FinalPlan, graph: string): string[] {
  return ['-hide_banner', '-nostats', '-loglevel', 'info', ...finalInputs(plan), '-filter_complex_script', graph, '-map', '[a]', '-t', seconds(plan.durationMs), '-f', 'null', '-'];
}

export function finalArgs(plan: FinalPlan, graph: string, output: string): string[] {
  return [
    ...quiet,
    ...finalInputs(plan),
    '-filter_complex_script', graph,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(videoFramesPerSecond),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-t', seconds(plan.durationMs), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', output,
  ];
}

/** The poster: the frame at `atMs`, 1280 px on its longer side. */
export function posterArgs(video: string, atMs: number, output: string): string[] {
  return [...quiet, '-ss', seconds(atMs), '-i', video, '-frames:v', '1', '-vf', "scale='if(gte(iw,ih),1280,-2)':'if(gte(iw,ih),-2,1280)'", '-q:v', '3', '-y', output];
}

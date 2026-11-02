import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { finalArgs, finalGraph, finalInputs, loudnessFilter, measureArgs, measuredLoudness, type FinalPlan } from '../../src/compose/final-pass.ts';
import { soundsFolder } from '../../src/compose/sound-effects.ts';

const plan: FinalPlan = {
  parts: ['part-1.mkv', 'part-2.mkv', 'part-3.mkv'],
  starts: [0, 2500, 4500],
  transitions: [
    { kind: 'crossfade', toward: 'start', ms: 500 },
    { kind: 'cut', toward: 'start', ms: 0 },
  ],
  direction: 'ltr',
  events: [
    { sound: 'pop', atMs: 3000 },
    { sound: 'click', atMs: 3300 },
    { sound: 'keys', atMs: 3820, untilMs: 4700 },
    { sound: 'click', atMs: 5000 },
  ],
  durationMs: 8500,
};

const measure = '[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-20.10",\n\t"input_tp" : "-6.00",\n\t"input_lra" : "3.20",\n\t"input_thresh" : "-30.40",\n\t"output_i" : "-14.00",\n\t"target_offset" : "0.10"\n}\nsize=N/A';

describe('the final pass (16 §16.8, ADR 0115, 2, 19, and 37)', () => {
  it('M5.8-H4 the parts joined with xfade and acrossfade, and a cut with concat', () => {
    const lines = finalGraph(plan, measuredLoudness(measure)).split(';\n');
    expect(lines.slice(0, 3)).toEqual(['[0:v][1:v]xfade=transition=fade:duration=0.500:offset=2.500[jv1]', '[jv1][2:v]concat=n=2:v=1:a=0[jv2]', '[jv2]format=yuv420p[v]']);
    expect(lines.slice(3, 6)).toEqual(['[0:a][1:a]acrossfade=d=0.500:c1=tri:c2=tri[ja1]', '[ja1][2:a]concat=n=2:v=0:a=1[ja2]', '[ja2]anull[joineda]']);
  });

  it('M5.8-H6 each sound read once, the key taps looped, each event at its time, quieter, mixed without normalizing', () => {
    expect(finalInputs(plan)).toEqual(['-i', 'part-1.mkv', '-i', 'part-2.mkv', '-i', 'part-3.mkv', '-i', path.join(soundsFolder, 'click.wav'), '-stream_loop', '-1', '-i', path.join(soundsFolder, 'keys.wav'), '-i', path.join(soundsFolder, 'pop.wav')]);
    const graph = finalGraph(plan, undefined);
    expect(graph).not.toContain('xfade');
    const lines = graph.split(';\n');
    expect(lines).toEqual(
      expect.arrayContaining([
        '[3:a]asplit=2[click0][click1]',
        '[click0]aformat=sample_rates=48000:channel_layouts=stereo,adelay=delays=3300:all=1,volume=-18dB[eclick0]',
        '[keys0]atrim=0:0.880,asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,adelay=delays=3820:all=1,volume=-24dB[ekeys0]',
        '[5:a]asplit=1[pop0]',
        '[joineda][eclick0][eclick1][ekeys0][epop0]amix=inputs=5:duration=first:normalize=0[mixed]',
        '[mixed]loudnorm=I=-14:TP=-1:LRA=11:print_format=json,aresample=48000[a]',
      ]),
    );
    expect(finalGraph({ ...plan, events: [] }, undefined)).toContain('[joineda]anull[mixed]');
  });

  it('M5.8-H7 the loudness measured, then applied with linear=true; silence left as it is', () => {
    const measured = measuredLoudness(measure);
    expect(loudnessFilter(measured)).toBe('loudnorm=I=-14:TP=-1:LRA=11:measured_I=-20.10:measured_TP=-6.00:measured_LRA=3.20:measured_thresh=-30.40:offset=0.10:linear=true');
    expect(loudnessFilter({ ...measured, input_i: '-inf' })).toBe('anull');
    expect(measureArgs(plan, 'measure.graph').slice(0, 4)).toEqual(['-hide_banner', '-nostats', '-loglevel', 'info']);
    expect(measureArgs(plan, 'measure.graph').slice(-6)).toEqual(['[a]', '-t', '8.500', '-f', 'null', '-']);
    const final = finalArgs(plan, 'final.graph', 'video.mp4');
    expect(final.slice(final.indexOf('-filter_complex_script'))).toEqual(['-filter_complex_script', 'final.graph', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', '8.500', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', 'video.mp4']);
  });

  it("M5.8-E4 a measure without loudnorm's JSON fails RENDER_FAILED", () => {
    for (const output of ['no json here', '{ "output_i": "-14" }', '{ not json }']) {
      expect(() => measuredLoudness(output)).toThrow(ProblemError);
      try {
        measuredLoudness(output);
      } catch (error) {
        expect(error instanceof ProblemError ? error.problem : undefined).toMatchObject({ code: 'kvvideo/RENDER_FAILED', params: { scene: null } });
      }
    }
  });
});

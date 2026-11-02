import { describe, expect, it } from 'vitest';
import { analysisArgs, analysisOf } from '../../src/review/analysis.ts';

const output = `[blackdetect @ 0x1] black_start:2 black_end:3.04 black_duration:1.04
[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 4
[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 7
[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 11
[silencedetect @ 0x3] silence_start: 1.5
[silencedetect @ 0x3] silence_end: 5.5 | silence_duration: 4
[Parsed_ebur128_1 @ 0x4] Summary:

  Integrated loudness:
    I:         -20.0 LUFS
    Threshold: -30.0 LUFS

  True peak:
    Peak:       -0.5 dBFS`;

describe("review's measures (16 §16.10, ADR 0115, 48)", () => {
  it('M5.9-H4 the silence, black and frozen pictures, and loudness, in time order', () => {
    expect(analysisOf(output, 12_000, true)).toEqual({
      loudness: { integratedLufs: -20, truePeakDb: -0.5 },
      problems: [
        { kind: 'loudness', atMs: 0, lengthMs: 12_000 },
        { kind: 'silence', atMs: 1500, lengthMs: 4000 },
        { kind: 'black', atMs: 2000, lengthMs: 1040 },
        { kind: 'frozen', atMs: 4000, lengthMs: 7000 },
      ],
    });
  });

  it('M5.9-H4 a frozen picture or silence that lasts to the end, levelled sound, and a video without sound', () => {
    const levelled = output.replace('-20.0 LUFS', '-14.2 LUFS').replace('-0.5 dBFS', '-1.3 dBFS').replace(/.*freeze_end.*\n/, '').replace(/.*silence_end.*\n/, '');
    const found = analysisOf(levelled, 12_000, true);
    expect(found.problems.map((problem) => [problem.kind, problem.atMs, problem.lengthMs])).toEqual([
      ['silence', 1500, 10_500],
      ['black', 2000, 1040],
      ['frozen', 4000, 8000],
    ]);
    expect(analysisOf(output, 12_000, false)).toEqual({ loudness: null, problems: [{ kind: 'black', atMs: 2000, lengthMs: 1040 }, { kind: 'frozen', atMs: 4000, lengthMs: 7000 }] });
    expect(analysisArgs('/w/v.mp4', false)).not.toContain('[a]');
    expect(analysisArgs('/w/v.mp4', true)).toContain('[0:v]blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=6[v];[0:a]silencedetect=n=-50dB:d=3,ebur128=peak=true[a]');
  });
});

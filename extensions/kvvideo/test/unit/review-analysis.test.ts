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
        { kind: 'loudness', atMs: 0, lengthMs: 12_000, reason: 'The integrated loudness is -20.0 LUFS, outside -15 to -13 LUFS. The true peak is -0.5 dBTP, above -1 dBTP.' },
        { kind: 'silence', atMs: 1500, lengthMs: 4000, reason: 'No sound for 4.0 s.' },
        { kind: 'black', atMs: 2000, lengthMs: 1040, reason: 'A black picture for 1.0 s.' },
        { kind: 'frozen', atMs: 4000, lengthMs: 7000, reason: "The picture doesn't change for 7.0 s." },
      ],
    });
  });

  it('M5.9-H4 a frozen picture or silence that lasts to the end, levelled sound, and a video without sound', () => {
    const levelled = output.replace('-20.0 LUFS', '-14.2 LUFS').replace('-0.5 dBFS', '-1.3 dBFS').replace(/.*freeze_end.*\n/, '').replace(/.*silence_end.*\n/, '');
    const found = analysisOf(levelled.replace('silence_start: 1.5', 'silence_start: 0.5'), 12_000, true);
    expect(found.problems.map((problem) => [problem.kind, problem.atMs, problem.lengthMs])).toEqual([
      ['silence', 500, 11_500],
      ['black', 2000, 1040],
      ['frozen', 4000, 8000],
    ]);
    expect(analysisOf(output, 12_000, false).problems.map((problem) => problem.kind)).toEqual(['black', 'frozen']);
    expect(analysisOf(output, 12_000, false).loudness).toBeNull();
    expect(analysisArgs('/w/v.mp4', false)).not.toContain('[a]');
    expect(analysisArgs('/w/v.mp4', true)).toContain('[0:v]blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=3[v];[0:a]silencedetect=n=-50dB:d=3,ebur128=peak=true[a]');
  });

  const measured = (lines: string): string => `${lines}\n[Parsed_ebur128_1 @ 0x4] Summary:\n    I:         -14.0 LUFS\n    Peak:       -1.5 dBFS`;

  it('M5.13-H3 each problem says what was measured and its bound', () => {
    const kvcare = measured('[silencedetect @ 0x3] silence_start: 9.83\n[silencedetect @ 0x3] silence_end: 13.436 | silence_duration: 3.606\n[blackdetect @ 0x1] black_start:20 black_end:20.8\n[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 30\n[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 33.5').replace('-14.0 LUFS', '-16.0 LUFS').replace('-1.5 dBFS', '-0.7 dBFS');
    expect(analysisOf(kvcare, 43_000, true).problems.map((problem) => problem.reason)).toEqual([
      'The integrated loudness is -16.0 LUFS, outside -15 to -13 LUFS. The true peak is -0.7 dBTP, above -1 dBTP.',
      'No sound for 3.6 s.',
      'A black picture for 0.8 s.',
      "The picture doesn't change for 3.5 s.",
    ]);
  });

  it('M5.13-H4 a picture still for 3 s is frozen', () => {
    expect(analysisArgs('/w/v.mp4', true).join(' ')).toContain('freezedetect=n=-60dB:d=3[v]');
  });

  it("M5.13-H5 an end card's silence of at most 5 s isn't a problem", () => {
    const endCard = measured('[silencedetect @ 0x3] silence_start: 25.405\n[silencedetect @ 0x3] silence_end: 29.2 | silence_duration: 3.795');
    expect(analysisOf(endCard, 29_200, true).problems).toEqual([]);
    expect(analysisOf(measured('[silencedetect @ 0x3] silence_start: 25.405'), 29_200, true).problems).toEqual([]);
  });

  it('M5.13-E1 a silence before the end, or over 5 s at the end, is a problem', () => {
    const early = measured('[silencedetect @ 0x3] silence_start: 6\n[silencedetect @ 0x3] silence_end: 10 | silence_duration: 4');
    const long = measured('[silencedetect @ 0x3] silence_start: 6');
    expect(analysisOf(early, 12_000, true).problems.map((problem) => [problem.kind, problem.atMs, problem.lengthMs])).toEqual([['silence', 6000, 4000]]);
    expect(analysisOf(long, 12_000, true).problems.map((problem) => [problem.kind, problem.atMs, problem.lengthMs])).toEqual([['silence', 6000, 6000]]);
  });

  it('M5.13-E2 only the loudness that is off is told', () => {
    const peak = measured('').replace('-1.5 dBFS', '-0.4 dBFS');
    const quiet = measured('').replace('-14.0 LUFS', '-18.2 LUFS').replace('-1.5 dBFS', '-3.0 dBFS');
    expect(analysisOf(peak, 5000, true).problems.map((problem) => problem.reason)).toEqual(['The true peak is -0.4 dBTP, above -1 dBTP.']);
    expect(analysisOf(quiet, 5000, true).problems.map((problem) => problem.reason)).toEqual(['The integrated loudness is -18.2 LUFS, outside -15 to -13 LUFS.']);
    expect(analysisOf(measured(''), 5000, true).problems).toEqual([]);
  });
});

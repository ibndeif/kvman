// What `review` measures in one ffmpeg run (plan 16 §16.10; ADR 0115, 20 and 48; ADR 0120, 1 and 23): black pictures
// of 0.5 s or more, pictures unchanged for 3 s or more, sound below −50 dB for 3 s or more but for an end card's
// silence of at most 5 s, and the loudness, read from what ffmpeg's filters print, each problem with its reason. A video
// without sound is measured for its picture only.

export type ProblemKind = 'silence' | 'black' | 'frozen' | 'loudness';

export type Problem = { kind: ProblemKind; atMs: number; lengthMs: number; reason: string };

export type Loudness = { integratedLufs: number; truePeakDb: number };

export type Analysis = { loudness: Loudness | null; problems: Problem[] };

/** ffmpeg's arguments to analyse `video`, with its sound when it has one. */
export function analysisArgs(video: string, hasSound: boolean): string[] {
  const picture = '[0:v]blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=3[v]';
  const sound = hasSound ? ';[0:a]silencedetect=n=-50dB:d=3,ebur128=peak=true[a]' : '';
  return ['-hide_banner', '-nostats', '-loglevel', 'info', '-i', video, '-filter_complex', `${picture}${sound}`, '-map', '[v]', ...(hasSound ? ['-map', '[a]'] : []), '-f', 'null', '-'];
}

const ms = (seconds: string | undefined): number => Math.round(Number(seconds ?? 0) * 1000);

// Spans that start on one line and end on a later one; one that never ends lasts to the video's end.
function spans(output: string, start: RegExp, end: RegExp, durationMs: number): { atMs: number; lengthMs: number }[] {
  const starts = [...output.matchAll(start)].map((match) => ms(match[1]));
  const ends = [...output.matchAll(end)].map((match) => ms(match[1]));
  return starts.map((atMs, index) => ({ atMs, lengthMs: Math.max(0, (ends[index] ?? durationMs) - atMs) }));
}

function loudnessOf(output: string): Loudness | null {
  const summary = output.slice(output.lastIndexOf('Summary:'));
  const integrated = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1];
  const peak = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1];
  if (integrated === undefined || peak === undefined) return null;
  // ebur128 floors its loudness at −70 LUFS; a peak of no sound at all, -inf, is read at that floor too.
  return { integratedLufs: integrated === '-inf' ? -70 : Number(integrated), truePeakDb: peak === '-inf' ? -70 : Number(peak) };
}

const tenths = (value: number): string => value.toFixed(1);
const secondsOf = (lengthMs: number): string => tenths(lengthMs / 1000);

// The loudness's reason, or undefined when it is within its bounds.
function loudnessReason(loudness: Loudness): string | undefined {
  const parts: string[] = [];
  if (loudness.integratedLufs < -15 || loudness.integratedLufs > -13) parts.push(`The integrated loudness is ${tenths(loudness.integratedLufs)} LUFS, outside -15 to -13 LUFS.`);
  if (loudness.truePeakDb > -1) parts.push(`The true peak is ${tenths(loudness.truePeakDb)} dBTP, above -1 dBTP.`);
  return parts.length === 0 ? undefined : parts.join(' ');
}

// A silence reaching the video's end, give or take a frame of rounding, that an end card may hold.
const endCardMs = 5000;
const endSlackMs = 100;

/** The analysis in ffmpeg's output, over a video of `durationMs`. */
export function analysisOf(output: string, durationMs: number, hasSound: boolean): Analysis {
  const black = [...output.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((match) => {
    const lengthMs = ms(match[2]) - ms(match[1]);
    return { kind: 'black' as const, atMs: ms(match[1]), lengthMs, reason: `A black picture for ${secondsOf(lengthMs)} s.` };
  });
  const frozen = spans(output, /freeze_start: ([\d.]+)/g, /freeze_end: ([\d.]+)/g, durationMs).map((span) => ({ kind: 'frozen' as const, ...span, reason: `The picture doesn't change for ${secondsOf(span.lengthMs)} s.` }));
  const silent = hasSound ? spans(output, /silence_start: (-?[\d.]+)/g, /silence_end: ([\d.]+)/g, durationMs).map((span) => ({ atMs: Math.max(0, span.atMs), lengthMs: span.lengthMs })) : [];
  const silence = silent
    .filter((span) => !(span.atMs + span.lengthMs >= durationMs - endSlackMs && span.lengthMs <= endCardMs))
    .map((span) => ({ kind: 'silence' as const, ...span, reason: `No sound for ${secondsOf(span.lengthMs)} s.` }));
  const loudness = hasSound ? loudnessOf(output) : null;
  const reason = loudness === null ? undefined : loudnessReason(loudness);
  const problems: Problem[] = [...(reason === undefined ? [] : [{ kind: 'loudness' as const, atMs: 0, lengthMs: durationMs, reason }]), ...silence, ...black, ...frozen];
  return { loudness, problems: problems.sort((a, b) => a.atMs - b.atMs) };
}

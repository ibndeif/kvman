// ffmpeg's arguments to clean one take of the person's voice (plan 16 §16.7; ADR 0115, 28 and 50): low rumble removed,
// steady noise reduced, silence below −45 dB trimmed at both ends down to 150 ms (the end trimmed by reversing the
// sound, so pauses inside the take stay), and the level evened out at −16 LUFS. With `clean` false, it is only
// converted. Either way it becomes 44.1 kHz mono WAV, ready to join.

const trimStart = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15';

export const cleanFilter = ['highpass=f=80', 'afftdn=nr=12:nf=-30', trimStart, 'areverse', trimStart, 'areverse', 'loudnorm=I=-16:TP=-1.5:LRA=11', 'aresample=44100'].join(',');

export function takeArgs(take: string, clean: boolean, output: string): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-i', take, '-vn', ...(clean ? ['-af', cleanFilter] : []), '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-y', output];
}

// ffmpeg's arguments to join a narration's sentences (plan 16 §16.6 and §16.7; ADR 0115, 41): each brought to the
// same sound, 250 ms of silence after every one but the last, joined in order and encoded as MP3 at 192 kb/s.

export const sentenceGapMs = 250;

export function joinNarrationArgs(inputs: readonly string[], output: string): string[] {
  const shaped = inputs.map((_, index) => {
    const pad = index === inputs.length - 1 ? '' : `,apad=pad_dur=${String(sentenceGapMs / 1000)}`;
    return `[${String(index)}:a]aformat=sample_rates=44100:channel_layouts=mono${pad}[s${String(index)}]`;
  });
  const joined = `${inputs.map((_, index) => `[s${String(index)}]`).join('')}concat=n=${String(inputs.length)}:v=0:a=1[out]`;
  return [
    '-hide_banner', '-loglevel', 'error',
    ...inputs.flatMap((input) => ['-i', input]),
    '-filter_complex', [...shaped, joined].join(';'),
    '-map', '[out]',
    '-codec:a', 'libmp3lame', '-b:a', '192k',
    '-y', output,
  ];
}

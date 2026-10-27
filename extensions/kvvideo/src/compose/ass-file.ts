import type { Caption } from '../narration/captions.ts';

// A scene's captions as an ASS file for ffmpeg's `subtitles` filter (plan 16 §16.7): white text with a black outline
// of 3 px, centered at the bottom or the top, 6% of the height from the edge. The style's encoding is -1, so libass
// takes each line's direction from its text and an Arabic line reads right to left, its full stop at its left end.

export type CaptionStyle = { width: number; height: number; family: string; size: number | undefined; position: 'bottom' | 'top' };

function timeOf(ms: number): string {
  const centiseconds = Math.floor(ms / 10);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor(centiseconds / 6000) % 60;
  const seconds = Math.floor(centiseconds / 100) % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centiseconds % 100)}`;
}

/** A caption's text as ASS shows it: no override braces, no backslashes, one line. */
export function assText(text: string): string {
  return text.replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim();
}

export function assFile(style: CaptionStyle, captions: readonly Caption[]): string {
  const size = style.size ?? Math.round(style.height / 18);
  const alignment = style.position === 'top' ? 8 : 2;
  const margin = Math.round(style.height * 0.06);
  const family = style.family.replace(/,/g, ' ');
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${String(style.width)}`,
    `PlayResY: ${String(style.height)}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${family},${String(size)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,${String(alignment)},40,40,${String(margin)},-1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...captions.map((caption) => `Dialogue: 0,${timeOf(caption.startMs)},${timeOf(caption.endMs)},Default,,0,0,0,,${assText(caption.text)}`),
    '',
  ].join('\n');
}

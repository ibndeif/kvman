import type { Caption } from '../narration/captions.ts';

// A scene's captions as an ASS file for ffmpeg's `subtitles` filter (plan 16 §16.8; ADR 0115, 18 and 42), centered at
// the bottom or the top, 6% of the height from the edge, one line at a time. `boxed` is white text on black at 65%
// with padding of a third of the text's size; `outline` is white text with a black outline of 3 px; `highlight` is
// boxed, and colours the words already spoken of a line whose words are timed. The style's encoding is -1, so libass
// takes each line's direction from its text and an Arabic line reads right to left.

export type CaptionLook = 'boxed' | 'outline' | 'highlight';

export type CaptionStyle = { width: number; height: number; family: string; size: number | undefined; position: 'bottom' | 'top'; look: CaptionLook; highlight: string };

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

/** `#RRGGBB` as an ASS colour, `&HAABBGGRR`, opaque. */
export function assColour(colour: string): string {
  return `&H00${`${colour.slice(5, 7)}${colour.slice(3, 5)}${colour.slice(1, 3)}`.toUpperCase()}`;
}

const box = '&H59000000';

function styleLine(name: string, style: CaptionStyle, primary: string, secondary: string): string {
  const size = style.size ?? Math.round(style.height / 18);
  const alignment = style.position === 'top' ? 8 : 2;
  const margin = Math.round(style.height * 0.06);
  const family = style.family.replace(/,/g, ' ');
  const border = style.look === 'outline' ? `0,0,1,3,0` : `0,0,3,${String(Math.round(size / 3))},0`;
  const outline = style.look === 'outline' ? '&H00000000' : box;
  const back = style.look === 'outline' ? '&H00000000' : box;
  return `Style: ${name},${family},${String(size)},${primary},${secondary},${outline},${back},0,0,0,0,100,100,${border},${String(alignment)},40,40,${String(margin)},-1`;
}

// A line's words, each held as ASS karaoke from the line's start: the words already spoken take the primary colour.
function karaoke(caption: Caption & { words: NonNullable<Caption['words']> }): string {
  const centiseconds = (ms: number): number => Math.max(0, Math.round(ms / 10));
  const first = caption.words[0]?.startMs ?? caption.startMs;
  const parts = first > caption.startMs ? [`{\\k${String(centiseconds(first - caption.startMs))}}`] : [];
  caption.words.forEach((word, index) => {
    const next = caption.words[index + 1]?.startMs ?? caption.endMs;
    parts.push(`{\\k${String(centiseconds(next - word.startMs))}}${assText(word.text)}${index === caption.words.length - 1 ? '' : ' '}`);
  });
  return parts.join('');
}

function dialogue(style: CaptionStyle, caption: Caption): string {
  const timed = style.look === 'highlight' && caption.words !== undefined && caption.words.length > 0;
  const text = timed && caption.words !== undefined ? karaoke({ ...caption, words: caption.words }) : assText(caption.text);
  return `Dialogue: 0,${timeOf(caption.startMs)},${timeOf(caption.endMs)},${timed ? 'Spoken' : 'Default'},,0,0,0,,${text}`;
}

export function assFile(style: CaptionStyle, captions: readonly Caption[]): string {
  const white = '&H00FFFFFF';
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
    styleLine('Default', style, white, white),
    ...(style.look === 'highlight' ? [styleLine('Spoken', style, assColour(style.highlight), white)] : []),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...captions.map((caption) => dialogue(style, caption)),
    '',
  ].join('\n');
}

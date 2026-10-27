import { describe, expect, it } from 'vitest';
import { assFile } from '../../src/compose/ass-file.ts';

describe("a scene's ASS file (16 §16.7)", () => {
  it('M5.4-H4 the size, the style at the bottom, and each caption as a Dialogue', () => {
    const file = assFile({ width: 1280, height: 720, family: 'IBM Plex Sans Arabic', size: undefined, position: 'bottom' }, [
      { text: 'Open the {app}. \\N', startMs: 0, endMs: 1250 },
      { text: 'افتح التطبيق.', startMs: 1250, endMs: 3_725_678 },
    ]);
    expect(file.split('\n')).toEqual([
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 1280',
      'PlayResY: 720',
      'WrapStyle: 0',
      'ScaledBorderAndShadow: yes',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,IBM Plex Sans Arabic,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,40,40,43,-1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:00.00,0:00:01.25,Default,,0,0,0,,Open the app. N',
      'Dialogue: 0,0:00:01.25,1:02:05.67,Default,,0,0,0,,افتح التطبيق.',
      '',
    ]);
  });

  it('M5.4-H4 the top, a given size, and a family with a comma', () => {
    const style = assFile({ width: 640, height: 360, family: 'My, Font', size: 40, position: 'top' }, []).split('\n')[9];
    expect(style).toBe('Style: Default,My  Font,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,8,40,40,22,-1');
  });
});

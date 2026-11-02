import { describe, expect, it } from 'vitest';
import { assColour, assFile, type CaptionStyle } from '../../src/compose/ass-file.ts';

const base: CaptionStyle = { width: 1280, height: 720, family: 'IBM Plex Sans Arabic', size: undefined, position: 'bottom', look: 'outline', highlight: '#FFD54A' };

describe("a scene's ASS file (16 §16.8, ADR 0115, 18 and 42)", () => {
  it('M5.4-H4 the size, the outline style at the bottom, and each caption as a Dialogue', () => {
    const file = assFile(base, [
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
    const style = assFile({ ...base, width: 640, height: 360, family: 'My, Font', size: 40, position: 'top' }, []).split('\n')[9];
    expect(style).toBe('Style: Default,My  Font,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,8,40,40,22,-1');
  });

  it('M5.7-H9 boxed is an opaque box at 65% with a third of the size as padding', () => {
    const style = assFile({ ...base, look: 'boxed', size: 60 }, []).split('\n')[9];
    expect(style).toBe('Style: Default,IBM Plex Sans Arabic,60,&H00FFFFFF,&H00FFFFFF,&H59000000,&H59000000,0,0,0,0,100,100,0,0,3,20,0,2,40,40,43,-1');
  });

  it('M5.7-H9 highlight colours the spoken words of a timed line, and boxes a line without words', () => {
    expect(assColour('#2563EB')).toBe('&H00EB6325');
    const file = assFile({ ...base, look: 'highlight', highlight: '#2563EB' }, [
      { text: 'Open the app.', startMs: 1000, endMs: 3000, words: [{ text: 'Open', startMs: 1200, endMs: 1500 }, { text: 'the', startMs: 1600, endMs: 1800 }, { text: 'app.', startMs: 1900, endMs: 2400 }] },
      { text: 'Done.', startMs: 3000, endMs: 4000 },
    ]).split('\n');
    expect(file[10]).toBe('Style: Spoken,IBM Plex Sans Arabic,40,&H00EB6325,&H00FFFFFF,&H59000000,&H59000000,0,0,0,0,100,100,0,0,3,13,0,2,40,40,43,-1');
    expect(file[14]).toBe('Dialogue: 0,0:00:01.00,0:00:03.00,Spoken,,0,0,0,,{\\k20}{\\k40}Open {\\k30}the {\\k110}app.');
    expect(file[15]).toBe('Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Done.');
  });
});

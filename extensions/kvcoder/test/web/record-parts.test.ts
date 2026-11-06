import { describe, expect, it } from 'vitest';
import { clockOf, lineParts, recorderType, takeName, takeType } from '../../web/src/record-parts.ts';

describe("a recording question's parts (08 §8.7, ADR 0115, 25 and 49)", () => {
  it('M5.10-H10 the runs of a line, lengths, types, and names', () => {
    const parts = lineParts('This is Notes, then sign in.', ['notes'], ['in', 'Notes']);
    expect(parts.map((part) => part.text).join('')).toBe('This is Notes, then sign in.');
    expect(parts.filter((part) => part.stress).map((part) => part.text)).toEqual(['Notes']);
    expect(parts.filter((part) => part.pause).map((part) => part.text)).toEqual(['Notes', 'in']);
    expect(lineParts('هذه الملاحظات.', ['الملاحظات'], []).filter((part) => part.stress).map((part) => part.text)).toEqual(['الملاحظات']);
    expect([clockOf(0), clockOf(5000), clockOf(65_400)]).toEqual(['0:00', '0:05', '1:05']);
    expect(recorderType((type) => type === 'audio/mp4' || type === 'audio/webm;codecs=opus')).toBe('audio/webm;codecs=opus');
    expect(recorderType((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(recorderType(() => false)).toBeUndefined();
    expect([takeType('audio/webm;codecs=opus'), takeType('audio/x-wav'), takeType('AUDIO/MP4'), takeType('image/png')]).toEqual(['audio/webm', 'audio/wav', 'audio/mp4', undefined]);
    expect([takeName(2, 'audio/mp4'), takeName(1, 'audio/webm')]).toEqual(['line-2.m4a', 'line-1.webm']);
  });

  it('M5.13-H14 every word of a run is bold, and the pause follows its last word', () => {
    const line = 'والفريق الطبي يقدر يوثّق بيانات الزيارة في السجل الطبي للمريض.';
    const parts = lineParts(line, ['السجل الطبي'], ['بيانات الزيارة']);
    expect(parts.map((part) => part.text).join('')).toBe(line);
    const bold = parts.flatMap((part, index) => (part.stress ? [index] : []));
    expect(bold.map((index) => parts[index]?.text)).toEqual(['السجل', 'الطبي']);
    expect(parts.findIndex((part) => part.text === 'الطبي')).toBeLessThan(bold[0] ?? 0);
    expect(parts.filter((part) => part.pause).map((part) => part.text)).toEqual(['الزيارة']);
  });

  it('M5.13-E9 a run is found across any spacing of the line', () => {
    expect(lineParts('Open  the notes', ['Open the'], []).filter((part) => part.stress).map((part) => part.text)).toEqual(['Open', 'the']);
  });
});


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
});

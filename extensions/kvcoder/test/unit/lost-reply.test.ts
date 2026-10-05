import { describe, expect, it } from 'vitest';
import { lostHint, lostTokens, repairedCalls, unaccountedTokens } from '../../src/turns/lost-reply.ts';

const text = (characters: number) => ({ type: 'text', text: 'a'.repeat(characters) });
const thinking = (characters: number) => ({ type: 'thinking', thinking: 'b'.repeat(characters) });

describe('a lost reply (08 §8.2, ADR 0009, 188 and 191)', () => {
  it('QA8-E6 ordinary replies are never lost: a short answer, a long Arabic one, one with thinking, and one with a call', () => {
    expect(lostTokens([text(5)], { output: 3 })).toBeUndefined();
    expect(lostTokens([{ type: 'text', text: 'ا'.repeat(814) }], { output: 376 })).toBeUndefined();
    expect(lostTokens([thinking(2600), text(310)], { output: 794, reasoning: 650 })).toBeUndefined();
    expect(lostTokens([text(30), { type: 'toolCall' }], { output: 5000 })).toBeUndefined();
  });

  it('QA8-E7 150 unexplained tokens is not lost, 151 is, reported reasoning is subtracted, visible thinking stands in when none is reported, and 400 characters of text is no longer short', () => {
    expect(unaccountedTokens([text(100)], { output: 200 })).toBe(150);
    expect(lostTokens([text(100)], { output: 200 })).toBeUndefined();
    expect(lostTokens([text(100)], { output: 201 })).toBe(151);
    expect(lostTokens([text(100)], { output: 201, reasoning: 51 })).toBeUndefined();
    expect(lostTokens([thinking(1000)], { output: 700 })).toBe(200);
    expect(lostTokens([thinking(1000)], { output: 700, reasoning: 0 })).toBe(200);
    expect(lostTokens([text(399)], { output: 5000 })).toBe(4800);
    expect(lostTokens([text(400)], { output: 5000 })).toBeUndefined();
  });

  it('QA8-E14 the twelve no-call replies of the real chats are classified as they were', () => {
    // [output tokens, reasoning tokens, text characters, thinking characters]: the five genuine final answers, then the lost replies.
    const genuine: [number, number, number, number][] = [[555, 9, 1216, 36], [553, 21, 1178, 98], [277, 118, 642, 518], [92, 20, 177, 84], [36, 0, 135, 0]];
    const lost: [number, number, number, number][] = [[6916, 66, 34, 284], [6762, 73, 225, 322], [5095, 126, 129, 531], [3374, 7, 46, 32], [868, 259, 192, 1163], [814, 315, 91, 1346]];
    for (const [output, reasoning, written, thought] of genuine) expect(lostTokens([thinking(thought), text(written)], { output, reasoning }), `genuine ${String(output)}`).toBeUndefined();
    for (const [output, reasoning, written, thought] of lost) expect(lostTokens([thinking(thought), text(written)], { output, reasoning }), `lost ${String(output)}`).toBeGreaterThan(150);
  });

  it('QA8-H6 the hint names the tokens to the nearest hundred, says to call again, and says what to do for a large file', () => {
    const hint = lostHint(3449);
    expect(hint).toContain('the provider produced about 3400 tokens, but no tool call or text reached me');
    expect(hint).toContain('Send it again now, calling the tool directly.');
    expect(hint).toContain('one file per reply, under about 150 lines each');
    expect(hint).toContain('one file per reply, under about 150 lines each, with `fs write`.');
  });

  it('QA8-E16 a call with no id gets one, a call with no name is dropped and counted, and a sound call next to them is kept', () => {
    const { blocks, broken } = repairedCalls([{ type: 'text', text: 'hi' }, { type: 'toolCall', id: '', name: 'bash' }, { type: 'toolCall', id: 'x', name: '' }, { type: 'toolCall', id: 'ok', name: 'bash' }]);
    expect(broken).toBe(1);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]?.id).toMatch(/^call_[0-9a-f-]{36}$/);
    expect(blocks[2]).toEqual({ type: 'toolCall', id: 'ok', name: 'bash' });
    expect(repairedCalls([{ type: 'text', text: 'only text' }])).toEqual({ blocks: [{ type: 'text', text: 'only text' }], broken: 0 });
  });
});

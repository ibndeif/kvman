import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { checkedAnswer, normalizeAnswer, type QuestionKind } from '../../src/connectors/ask.ts';
import type { JsonValue, QuestionDoc } from '../../src/schemas/records.ts';
import { answered } from '../support/model-script.ts';
import { answerFingerprint } from '../../src/turns/answer-fingerprint.ts';

const digest = (canonical: string) => createHash('sha256').update(canonical).digest('hex');
const question = (kind: QuestionKind, payload: Record<string, JsonValue> = {}): QuestionDoc => ({
  sessionId: 'session', rootSessionId: 'session', turnId: 'turn', toolCallId: 'call', kind, question: payload,
});
const choice = { prompt: 'Choose', multiple: false, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };

describe('validated answer fingerprints', () => {
  it.each<{ kind: QuestionKind; answer: JsonValue; value: JsonValue; canonical: string }>([
    { kind: 'text', answer: { text: 'Keep \n exact ✓' }, value: { text: 'Keep \n exact ✓' }, canonical: '{"text":"Keep \\n exact ✓"}' },
    { kind: 'text', answer: { text: '' }, value: { text: '' }, canonical: '{"text":""}' },
    { kind: 'choice', answer: { selected: ['b', 'a'], other: 'typed' }, value: { selected: ['b', 'a'], other: 'typed' }, canonical: '{"other":"typed","selected":["b","a"]}' },
    { kind: 'choice', answer: { selected: [] }, value: { selected: [] }, canonical: '{"selected":[]}' },
    { kind: 'confirm', answer: { confirmed: false }, value: { confirmed: false }, canonical: '{"confirmed":false}' },
    { kind: 'confirm', answer: { confirmed: true }, value: { confirmed: true }, canonical: '{"confirmed":true}' },
    { kind: 'approval', answer: { confirmed: true }, value: true, canonical: 'true' },
    { kind: 'approval', answer: { confirmed: false }, value: false, canonical: 'false' },
    ...(['text', 'choice', 'confirm'] as const).map(kind => ({ kind, answer: { dismissed: true }, value: { dismissed: true }, canonical: '{"dismissed":true}' })),
    { kind: 'approval', answer: { dismissed: true }, value: false, canonical: 'false' },
  ])('normalizes $kind as its validated value, not raw input JSON', ({ kind, answer, value, canonical }) => {
    const before = structuredClone(answer);
    expect(normalizeAnswer(kind, answer)).toEqual(value);
    expect(answerFingerprint(kind, answer)).toBe(digest(canonical));
    expect(answerFingerprint(kind, answer)).toMatch(/^[0-9a-f]{64}$/);
    expect(answer).toEqual(before);
  });
  it('orders object keys independently of input insertion order', () => {
    expect(answerFingerprint('choice', { selected: ['a'], other: 'x' })).toBe(answerFingerprint('choice', { other: 'x', selected: ['a'] }));
  });
  it('equates approval dismissal with denial, not confirmation dismissal', () => {
    expect(answerFingerprint('approval', { confirmed: false })).toBe(answerFingerprint('approval', { dismissed: true }));
    expect(answerFingerprint('approval', { confirmed: true })).not.toBe(answerFingerprint('approval', { dismissed: true }));
    expect(answerFingerprint('confirm', { confirmed: false })).not.toBe(answerFingerprint('confirm', { dismissed: true }));
  });
  it('preserves ordered selections, duplicates, other-field presence and exact text', () => {
    expect(answerFingerprint('choice', { selected: ['a', 'b'] })).not.toBe(answerFingerprint('choice', { selected: ['b', 'a'] }));
    expect(answerFingerprint('choice', { selected: ['a'] })).not.toBe(answerFingerprint('choice', { selected: ['a', 'a'] }));
    expect(answerFingerprint('choice', { selected: [] })).not.toBe(answerFingerprint('choice', { selected: [], other: '' }));
    expect(answerFingerprint('text', { text: 'x' })).not.toBe(answerFingerprint('text', { text: ' x ' }));
  });
  it('never interprets arbitrary JSON-looking text as a decision or dismissal', () => {
    expect(normalizeAnswer('text', { text: '{"dismissed":true}' })).toEqual({ text: '{"dismissed":true}' });
    expect(answerFingerprint('text', { text: '{"dismissed":true}' })).not.toBe(answerFingerprint('text', { dismissed: true }));
  });
  it.each<{ kind: QuestionKind; answer: unknown }>([
    ...(['text', 'choice', 'confirm', 'approval'] as const).flatMap(kind => [
      { kind, answer: null }, { kind, answer: {} }, { kind, answer: { dismissed: false } },
      { kind, answer: { dismissed: true, extra: 'not-normalized-away' } },
    ]),
    { kind: 'text', answer: { text: 1 } }, { kind: 'text', answer: 'text' },
    { kind: 'text', answer: { text: 'x', confirmed: true } },
    { kind: 'choice', answer: { selected: 'a' } }, { kind: 'choice', answer: { selected: [1] } },
    { kind: 'choice', answer: { selected: ['a'], other: false } },
    { kind: 'confirm', answer: { confirmed: 'true' } }, { kind: 'approval', answer: { confirmed: 0 } },
    { kind: 'approval', answer: false }, { kind: 'confirm', answer: { confirmed: true, extra: 'x' } },
  ])('rejects invalid $kind shape without echoing the answer', ({ kind, answer }) => {
    expect(() => answerFingerprint(kind, answer)).toThrow(ProblemError);
    try { normalizeAnswer(kind, answer); } catch (error) {
      if (!(error instanceof ProblemError)) throw error;
      expect(error.problem.code).toBe('VALIDATION_FAILED');
      expect(error.problem.params).toEqual({});
    }
  });
});

describe('first-application validation remains question-aware', () => {
  it('returns the existing typed answer output and approval decision', () => {
    expect(checkedAnswer(question('text'), { text: 'answer' })).toEqual({ kind: 'result', text: answered('{"text":"answer"}') });
    expect(checkedAnswer(question('approval'), { dismissed: true })).toEqual({ kind: 'approval', approved: false });
    expect(checkedAnswer(question('approval'), { confirmed: true })).toEqual({ kind: 'approval', approved: true });
  });
  it('keeps unknown-option rejection on first application while permitting shape-only retry hashing', () => {
    expect(() => checkedAnswer(question('choice', choice), { selected: ['unknown'] })).toThrow("isn't one of the options");
    expect(answerFingerprint('choice', { selected: ['unknown'] })).toBe(digest('{"selected":["unknown"]}'));
    // Hashing alone never authorizes application; only a matching receipt acknowledges a previously validated value.
  });
  it.each([{ selected: [] }, { selected: ['a', 'b'] }, { selected: ['a'], other: 'x' }])('retains the existing single-choice constraints for %j', answer => {
    expect(() => checkedAnswer(question('choice', choice), answer)).toThrow(ProblemError);
  });
  it('allows the existing multi-choice and other-answer rules, without treating selections as a set', () => {
    expect(checkedAnswer(question('choice', { ...choice, multiple: true, other: true }), { selected: ['b', 'a', 'a'], other: 'x' }).kind).toBe('result');
    expect(checkedAnswer(question('choice', { ...choice, other: true }), { selected: [], other: 'x' }).kind).toBe('result');
    expect(checkedAnswer(question('choice', choice), { dismissed: true })).toEqual({ kind: 'result', text: answered('{"dismissed":true}') });
  });
});

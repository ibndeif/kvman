import { describe, expect, expectTypeOf, it } from 'vitest';
import type { InputOf, Json, OutputOf } from '@kvman/sdk';
import { answerReceiptDocSchema, type AnswerReceiptDoc } from '../../src/schemas/records.ts';
import type { Session } from '../../src/sessions/session-view.ts';
import type {} from '../../src/api.ts';

const receipt = {
  questionId: 'question', sessionId: 'session', turnId: 'turn', toolCallId: 'call',
  questionKind: 'text' as const, answerFingerprint: 'a'.repeat(64),
  createdAt: '2026-10-10T00:00:00.000Z',
};

describe('answer receipt data contract (M2.4-E99)', () => {
  it('has only approved internal fields and leaves public API/DTO types unchanged', () => {
    expectTypeOf<AnswerReceiptDoc>().toEqualTypeOf<{
      questionId: string; sessionId: string; turnId: string; toolCallId: string;
      questionKind: 'text' | 'choice' | 'confirm' | 'approval';
      answerFingerprint: string; createdAt: string;
    }>();
    expectTypeOf<InputOf<'kvcoder.question.answer'>>().toEqualTypeOf<{ questionId: string; answer: Json }>();
    expectTypeOf<OutputOf<'kvcoder.question.answer'>>().toEqualTypeOf<{ jobId: string | null }>();
    expectTypeOf<Extract<keyof Session, 'answerFingerprint' | 'questionKind'>>().toEqualTypeOf<never>();
    expect(answerReceiptDocSchema.parse(receipt)).toEqual(receipt);
  });

  it.each(Object.keys(receipt))('requires %s without applying a default', field => {
    const input = { ...receipt };
    Reflect.deleteProperty(input, field);
    expect(answerReceiptDocSchema.safeParse(input).success).toBe(false);
  });

  it.each(['text', 'choice', 'confirm', 'approval'] as const)('accepts existing question kind %s', questionKind => {
    expect(answerReceiptDocSchema.parse({ ...receipt, questionKind }).questionKind).toBe(questionKind);
  });

  it.each(['other', '', null, 1])('rejects unapproved question kind %j', questionKind => {
    expect(answerReceiptDocSchema.safeParse({ ...receipt, questionKind }).success).toBe(false);
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), ' '.repeat(64), null, 1])('rejects invalid fingerprint %j', answerFingerprint => {
    expect(answerReceiptDocSchema.safeParse({ ...receipt, answerFingerprint }).success).toBe(false);
  });

  it('accepts hexadecimal casing, without mutating the caller record', () => {
    const input = { ...receipt, answerFingerprint: 'ABCDEF0123456789'.repeat(4) };
    expect(answerReceiptDocSchema.parse(input)).toEqual(input);
    expect(input.answerFingerprint).toBe('ABCDEF0123456789'.repeat(4));
  });

  it.each(['', 'not-a-date', '2026-10-10', null])('rejects invalid receipt time %j', createdAt => {
    expect(answerReceiptDocSchema.safeParse({ ...receipt, createdAt }).success).toBe(false);
  });

  it.each(['questionId', 'sessionId', 'turnId', 'toolCallId'])('rejects a non-string %s', field => {
    expect(answerReceiptDocSchema.safeParse({ ...receipt, [field]: 42 }).success).toBe(false);
  });

  it('does not project raw answers, options, launch payloads or job tracking into stored output', () => {
    const input = { ...receipt, answer: 'private answer', question: { prompt: 'private prompt', options: [] }, payload: { task: 'private task' }, phase: 'claimed', jobId: 'job' };
    expect(answerReceiptDocSchema.parse(input)).toEqual(receipt);
    expect(input.answer).toBe('private answer');
  });
});

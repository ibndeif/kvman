import { describe, expect, it } from 'vitest';
import {
  emptyEnvelopeSchema,
  fileEnvelopeSchema,
  jobEnvelopeSchema,
  kernelProblemCodes,
  outputEnvelopeSchema,
  ProblemError,
  problemSchema,
  queuedEnvelopeSchema,
} from '../src/index.ts';
import { fileRow, jobId, jobRow } from './sample-rows.ts';

const problem = { code: 'NOT_FOUND', message: 'No such command.', params: { name: 'notes.add' } };

describe('problems and envelopes (05, 04 §4.1)', () => {
  it('M1.2-H3 every envelope of 04 §4.1 parses', () => {
    expect(outputEnvelopeSchema.safeParse({ ok: true, output: { id: 'a' }, jobId }).success).toBe(true);
    expect(queuedEnvelopeSchema.safeParse({ ok: true, jobId }).success).toBe(true);
    expect(jobEnvelopeSchema.safeParse({ ok: true, job: jobRow }).success).toBe(true);
    expect(fileEnvelopeSchema.safeParse({ ok: true, file: fileRow }).success).toBe(true);
    expect(emptyEnvelopeSchema.safeParse({ ok: true }).success).toBe(true);
    expect(outputEnvelopeSchema.safeParse({ ok: false, problem, jobId }).success).toBe(true);
  });

  it('M1.2-E10 a code is a kernel code or <namespace>/UPPER_SNAKE', () => {
    expect(kernelProblemCodes).toContain('INTERRUPTED');
    for (const code of [...kernelProblemCodes, 'kvai/NO_MODEL']) {
      expect(problemSchema.safeParse({ code, message: 'm' }).success, code).toBe(true);
    }
    for (const code of ['kvai/no_model', 'NOT_A_CODE', 'KvAi/X']) {
      expect(problemSchema.safeParse({ code, message: 'm' }).error?.issues.map((issue) => issue.path.join('.')), code).toEqual(['code']);
    }
  });

  it('M1.2-E11 malformed envelopes and problems fail', () => {
    expect(outputEnvelopeSchema.safeParse({ ok: true, output: {}, jobId, problem }).success).toBe(false);
    expect(outputEnvelopeSchema.safeParse({ ok: false }).success).toBe(false);
    expect(problemSchema.safeParse({ code: 'TOO_LARGE', message: 'm', params: { limit: Infinity } }).success).toBe(false);
  });

  it('M1.2-E12 a ProblemError is an Error that carries its Problem', () => {
    const error = new ProblemError({ code: 'kvai/NO_MODEL', message: 'No model is set.' });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('No model is set.');
    expect(error.problem).toEqual({ code: 'kvai/NO_MODEL', message: 'No model is set.' });
  });
});

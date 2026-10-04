import { describe, expect, it, vi } from 'vitest';
import { z, ProblemError, type Ctx } from '@kvman/sdk';
import { binFailureProblem, binResult, lastOutputLine } from '../../src/run-bin.ts';

const outputSchema = z.object({ folder: z.string() });

function makeLog(): { log: Ctx['log']; errors: { message: string; fields: unknown }[] } {
  const errors: { message: string; fields: unknown }[] = [];
  const log: Ctx['log'] = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (message: string, fields?: Record<string, unknown>) => {
      errors.push({ message, fields });
    },
  };
  return { log, errors };
}

function plainError(bin: string, run: { exitCode: number; stdout: string; stderr: string }): { error: unknown; errors: { message: string; fields: unknown }[] } {
  const { log, errors } = makeLog();
  let error: unknown;
  try {
    binResult(log, bin, run, outputSchema);
  } catch (thrown) {
    error = thrown;
  }
  return { error, errors };
}

describe("the bin's output and errors (ADR 0010, 14, 20)", () => {
  it('QA17-E14 lastOutputLine gives the last non-empty line, or undefined with none', () => {
    expect(lastOutputLine('first\nsecond\n')).toBe('second');
    expect(lastOutputLine('first\n  \nsecond\n\n')).toBe('second');
    expect(lastOutputLine('')).toBeUndefined();
    expect(lastOutputLine('\n  \n')).toBeUndefined();
  });

  it('QA17-E14 binFailureProblem maps the bin codes to Problems with the same message and params', () => {
    for (const code of ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'] as const) {
      const problem = binFailureProblem({ code, message: 'taken', params: { folder: 'taken' } });
      expect(problem).toBeInstanceOf(ProblemError);
      expect(problem?.problem).toEqual({ code: `kvcustomizer/${code}`, message: 'taken', params: { folder: 'taken' } });
    }
    expect(binFailureProblem({ code: 'VALIDATION_FAILED', message: 'bad', params: { field: 'name' } })?.problem).toEqual({ code: 'VALIDATION_FAILED', message: 'bad', params: { field: 'name' } });
    expect(binFailureProblem({ code: 'NOT_FOUND', message: 'gone' })?.problem).toEqual({ code: 'NOT_FOUND', message: 'gone', params: {} });
    expect(binFailureProblem({ code: 'NOT_RUNNING', message: 'away' })).toBeUndefined();
    expect(binFailureProblem({ code: 'BOGUS', message: 'weird' })).toBeUndefined();
  });

  it('QA17-E14 exit 0 with a valid last stdout line returns the parsed output', () => {
    const { log } = makeLog();
    expect(binResult(log, 'kvman-new', { exitCode: 0, stdout: 'scaffolding\n{"folder":"notes"}\n\n', stderr: '' }, outputSchema)).toEqual({ folder: 'notes' });
  });

  it('QA17-E14 exit 0 with bad JSON or a wrong shape throws a plain Error and logs only the bin and the exit code', () => {
    for (const stdout of ['not json\n', '{"other":1}\n']) {
      const { error, errors } = plainError('kvman-new', { exitCode: 0, stdout: `noise\n${stdout}\n`, stderr: '' });
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ProblemError);
      expect((error as Error).message).toBe('kvman-new failed.');
      expect(errors).toHaveLength(1);
      expect(errors[0]?.fields).toEqual({ bin: 'kvman-new', exitCode: 0 });
    }
  });

  it('QA17-E14 exit 1 with a structured failure becomes the matching kvcustomizer Problem', () => {
    for (const code of ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'] as const) {
      const { log } = makeLog();
      let error: unknown;
      try {
        binResult(log, 'kvman-new', { exitCode: 1, stdout: '', stderr: `noise\n${JSON.stringify({ code, message: 'taken', params: { folder: 'taken' } })}\n\n` }, outputSchema);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).problem).toEqual({ code: `kvcustomizer/${code}`, message: 'taken', params: { folder: 'taken' } });
    }
  });

  it('QA17-E14 VALIDATION_FAILED and NOT_FOUND stay as they are', () => {
    for (const [code, expected] of [['VALIDATION_FAILED', 'VALIDATION_FAILED'], ['NOT_FOUND', 'NOT_FOUND']] as const) {
      const { log } = makeLog();
      let error: unknown;
      try {
        binResult(log, 'kvman-preset', { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ code, message: 'bad' })}\n` }, outputSchema);
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(ProblemError);
      expect((error as ProblemError).problem.code).toBe(expected);
      expect((error as ProblemError).problem.message).toBe('bad');
    }
  });

  it('QA17-E14 an unknown code, NOT_RUNNING, exit code 2, no stderr, a non-JSON line, and a wrong shape fail plainly without the output', () => {
    const secret = 'secret-output-marker';
    const cases: { exitCode: number; stdout: string; stderr: string }[] = [
      { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ code: 'BOGUS', message: secret })}\n` },
      { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ code: 'NOT_RUNNING', message: secret })}\n` },
      { exitCode: 2, stdout: secret, stderr: secret },
      { exitCode: 1, stdout: '', stderr: '' },
      { exitCode: 1, stdout: '', stderr: `first line\nnot json ${secret}\n` },
      { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ wrong: secret })}\n` },
    ];
    for (const run of cases) {
      const { error, errors } = plainError('kvman-new', run);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ProblemError);
      expect((error as Error).message).toBe('kvman-new failed.');
      expect((error as Error).message).not.toContain(secret);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.fields).toEqual({ bin: 'kvman-new', exitCode: run.exitCode });
      expect(JSON.stringify(errors[0]?.fields)).not.toContain(secret);
      expect(JSON.stringify(errors[0]?.fields)).not.toContain('--name');
    }
  });
});

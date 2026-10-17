import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { fatalFields, listenForFatal } from '../../src/fatal-errors.ts';

// An error nothing caught is written to the log, then kvman stops (plan 02 §2.14, ADR 0085, 6).

type Logger = Parameters<typeof listenForFatal>[1];
type Record = { message: string; fields: unknown };

function recordingLogger(): { logger: Logger; errors: Record[] } {
  const errors: Record[] = [];
  const ignore = (): void => undefined;
  return { logger: { debug: ignore, info: ignore, warn: ignore, error: (message, fields) => errors.push({ message, fields }) }, errors };
}

describe('a crash leaves a record (ADR 0085, 6)', () => {
  it('QA53-H5 an unexpected error is written to the log', () => {
    const source = new EventEmitter();
    const { logger, errors } = recordingLogger();
    let stops = 0;
    const fatal = listenForFatal(source, logger, () => {
      stops += 1;
    });
    source.emit('uncaughtException', Object.assign(new Error('boom'), { code: 'EXAMPLE' }));
    expect(errors).toEqual([{ message: 'kvman stopped on an unexpected error.', fields: { code: 'EXAMPLE', stack: expect.stringContaining('boom') } }]);
    expect(stops).toBe(1);
    source.emit('unhandledRejection', new Error('later'));
    expect(errors[1]).toEqual({ message: 'kvman stopped on an unexpected error.', fields: { stack: expect.stringContaining('later') } });
    expect(stops).toBe(2);
    fatal.dispose();
    source.emit('uncaughtException', new Error('after'));
    source.emit('unhandledRejection', new Error('after'));
    expect(errors).toHaveLength(2);
    expect(stops).toBe(2);
  });

  it('QA53-E3 the crash record carries no payload', () => {
    const fields = fatalFields(new ProblemError({ code: 'VALIDATION_FAILED', message: 'The input is not valid.', params: { secret: 'hidden-value' } }));
    expect(Object.keys(fields).sort()).toEqual(['code', 'stack']);
    expect(fields.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(fields)).not.toContain('hidden-value');
  });
});

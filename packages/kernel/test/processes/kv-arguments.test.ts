import { describe, expect, it } from 'vitest';
import { parseArguments, UsageError, type InputSchema } from '../../src/index.ts';

const input: InputSchema = {
  properties: {
    fileId: { type: 'string' }, count: { type: 'integer' }, ratio: { type: 'number' }, force: { type: 'boolean' }, tags: { type: 'array', items: { type: 'string' } },
    meta: { type: 'object' },
  },
};

const noStdin = (): string => {
  throw new Error('this call reads no stdin');
};

describe('kv arguments (plan 12 §12.6, ADR 0141)', () => {
  it('M2.6-E28 flags map to input fields by their JSON Schema types, and mistakes are usage errors', () => {
    expect(parseArguments(['--file-id', 'a', '--count', '3', '--ratio', '0.5', '--force', '--tags', 'x', '--tags', 'y', '--meta', '{"k":1}'], input, noStdin)).toEqual({
      payload: { fileId: 'a', count: 3, ratio: 0.5, force: true, tags: ['x', 'y'], meta: { k: 1 } },
    });
    expect(parseArguments(['--no-force'], input, noStdin)).toEqual({ payload: { force: false } });
    for (const argv of [['--count', 'x'], ['--unknown', '1'], ['--count'], ['--wait', '70000']]) {
      expect(() => parseArguments(argv, input, noStdin), argv.join(' ')).toThrow(UsageError);
    }
    expect(parseArguments(['--json', '-', '--wait', '500'], input, () => '{"fileId":"from stdin"}')).toEqual({ payload: { fileId: 'from stdin' }, wait: 500 });
    expect(parseArguments(['--meta-file', '-', '--idempotency-key', 'k1'], input, () => '{"k":2}')).toEqual({ payload: { meta: { k: 2 } }, idempotencyKey: 'k1' });
  });
});

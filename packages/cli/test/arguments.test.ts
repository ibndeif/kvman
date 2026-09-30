import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kvmanHome, parseArguments } from '../src/arguments.ts';

describe('arguments (01 §1.2, ADR 0009, 46)', () => {
  it('M1.8-E2 an unknown flag, a bad mode, log level, or port, and a positional argument fail VALIDATION_FAILED', () => {
    for (const argv of [['--nope'], ['--mode', 'tui'], ['--log-level', 'loud'], ['--port', '70000'], ['--port', 'x'], ['--port', '-1'], ['serve']]) {
      expect(() => parseArguments(argv), argv.join(' ')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    }
  });

  it('M1.8-E3 --home wins over KVMAN_HOME, which wins over ~/.kvman', () => {
    expect(kvmanHome('/a', { KVMAN_HOME: '/b' }, '/user')).toBe(path.resolve('/a'));
    expect(kvmanHome(undefined, { KVMAN_HOME: '/b' }, '/user')).toBe(path.resolve('/b'));
    expect(kvmanHome(undefined, {}, '/user')).toBe(path.join('/user', '.kvman'));
  });

  it('M1.8-E4 --port 0 is a port, and without --port none is given', () => {
    expect(parseArguments(['--port', '0'])).toMatchObject({ port: 0 });
    expect(parseArguments([])).toEqual({ kind: 'run', mode: undefined, preset: undefined, home: undefined, port: undefined, yes: false, open: true, logLevel: 'info' });
    expect(parseArguments(['--mode', 'web', '--preset', 'dev', '--yes', '--no-open', '--log-level', 'warn', '--port', '3738'])).toEqual({
      kind: 'run',
      mode: 'web',
      preset: 'dev',
      home: undefined,
      port: 3738,
      yes: true,
      open: false,
      logLevel: 'warn',
    });
  });
});

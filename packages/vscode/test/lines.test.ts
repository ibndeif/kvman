import { describe, expect, it } from 'vitest';
import { readLine } from '../src/lines.ts';

describe("kvman's lines (14 §14.2, 15 §15.3)", () => {
  it('M4.2-E3 the five line shapes are read, and anything else is unreadable', () => {
    const lines = [
      { kind: 'trust', language: 'ar', versions: [{ name: 'a', version: '1.0.0', source: 'npm:1.0.0' }] },
      { kind: 'running', url: 'http://127.0.0.1:3737/?workspace=home', port: 3737 },
      { kind: 'joined', url: 'http://127.0.0.1:3737/?workspace=w1', port: 3737 },
      { kind: 'restarting' },
      { kind: 'failed', problem: { code: 'KVMAN_RUNNING', message: 'x' } },
      { kind: 'failed', language: 'en', problem: { code: 'PORT_IN_USE', message: 'y', params: { port: 3737 } } },
    ];
    for (const line of lines) expect(readLine(JSON.stringify(line))).toEqual(line);
    for (const text of ['hello', '{}', '{"kind":"running","url":5,"port":1}', '{"kind":"other"}', '', '[1]']) expect(readLine(text), text).toBeUndefined();
  });

  it('M4.2-H14 an unreadable line, such as a sentence, gives nothing', () => {
    expect(readLine('kvman is running at http://127.0.0.1:3737')).toBeUndefined();
  });
});

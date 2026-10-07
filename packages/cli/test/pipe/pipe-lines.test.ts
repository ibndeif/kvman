import { describe, expect, it } from 'vitest';
import { acceptsTrust, encodeLine, failedLine, trustLine, type PipeLine } from '../../src/pipe/pipe-lines.ts';

describe('the lines of a piped run (14 §14.2)', () => {
  it('M3.1-E2 a line is one JSON object and a newline, with no key it has no value for', () => {
    const problem = { code: 'PORT_IN_USE', message: 'The port 3737 is already in use.', params: { port: 3737 } };
    const lines: [PipeLine, string][] = [
      [
        trustLine('ar', [{ name: '@acme/hello', version: '1.0.0', source: 'npm:1.0.0' }]),
        '{"kind":"trust","language":"ar","versions":[{"name":"@acme/hello","version":"1.0.0","source":"npm:1.0.0"}]}',
      ],
      [{ kind: 'running', url: 'http://127.0.0.1:3737/?workspace=home', port: 3737 }, '{"kind":"running","url":"http://127.0.0.1:3737/?workspace=home","port":3737}'],
      [{ kind: 'joined', url: 'http://127.0.0.1:3737/?workspace=home', port: 3737 }, '{"kind":"joined","url":"http://127.0.0.1:3737/?workspace=home","port":3737}'],
      [{ kind: 'restarting' }, '{"kind":"restarting"}'],
      [failedLine(problem, 'en'), '{"kind":"failed","language":"en","problem":{"code":"PORT_IN_USE","message":"The port 3737 is already in use.","params":{"port":3737}}}'],
      [failedLine({ code: 'KVMAN_RUNNING', message: 'Another\nkvman runs.' }, undefined), '{"kind":"failed","problem":{"code":"KVMAN_RUNNING","message":"Another\\nkvman runs."}}'],
    ];
    for (const [line, text] of lines) expect(encodeLine(line)).toBe(`${text}\n`);
  });

  it('M3.1-E3 only { "trust": true } accepts', () => {
    expect(acceptsTrust('{"trust":true}')).toBe(true);
    expect(acceptsTrust(' { "trust": true } ')).toBe(true);
    for (const text of ['{"trust":false}', '{"trust":"yes"}', '{"trust":true,"more":1}', 'y', 'true', '']) expect(acceptsTrust(text), text).toBe(false);
  });
});

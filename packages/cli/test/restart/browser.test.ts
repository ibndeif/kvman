import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunArguments } from '../../src/arguments.ts';
import { openBrowser } from '../../src/browser.ts';
import { runKvman } from '../../src/run-kvman.ts';
import { api, outputOf } from '../support/api.ts';
import { useSandbox } from '../support/sandbox.ts';

vi.mock('../../src/browser.ts', () => ({ openBrowser: vi.fn() }));

const sandbox = useSandbox();
const runningLine = /kvman is running at http:\/\/127\.0\.0\.1:(\d+)\//g;
const variables = process.env['KVMAN_HOME'];

afterEach(() => {
  if (variables === undefined) delete process.env['KVMAN_HOME'];
  else process.env['KVMAN_HOME'] = variables;
  vi.mocked(openBrowser).mockClear();
});

describe('the browser and a restart (01 §1.2, ADR 0024, 1)', { timeout: 120_000 }, () => {
  it('QA36-H17 the browser is opened for the first start and not for the restart', async () => {
    const world = sandbox();
    const output = new PassThrough();
    let printed = '';
    output.setEncoding('utf8').on('data', (text: string) => (printed += text));
    const args: RunArguments = { kind: 'run', mode: undefined, preset: world.appPreset(), home: world.home, port: 0, yes: true, open: true, logLevel: 'error' };
    const running = runKvman(args, {
      variables: {},
      startFolder: world.start,
      userFolder: world.user,
      platform: process.platform,
      terminal: { input: new PassThrough(), output, isTerminal: false },
      errors: new PassThrough(),
      exitAtOnce: () => {
        throw new Error('kvman exited at once.');
      },
    });
    const portAt = (count: number) =>
      vi.waitFor(() => {
        const port = [...printed.matchAll(runningLine)][count - 1]?.[1];
        if (port === undefined) throw new Error(`kvman has not printed running line ${String(count)}.`);
        return Number(port);
      }, { timeout: 30_000, interval: 50 });
    expect(outputOf(await api(await portAt(1)).command('kernel.restart', {}))).toEqual({ restarting: true });
    await portAt(2);
    expect(vi.mocked(openBrowser)).toHaveBeenCalledTimes(1);
    process.emit('SIGINT');
    expect(await running).toBe(0);
  });
});

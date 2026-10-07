import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { programRunner, type StartProgram } from '../../src/uninstall/run-program.ts';

type Started = { program: string; args: readonly string[]; options: Record<string, unknown> };

// A child that prints to both streams and exits with `code`, or fails to start.
function fakeStart(started: Started[], code: number | 'missing'): StartProgram {
  const start = (program: string, args: readonly string[], options: Record<string, unknown>): EventEmitter => {
    started.push({ program, args, options });
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
    setImmediate(() => {
      if (code === 'missing') return void child.emit('error', new Error('spawn npm ENOENT'));
      child.stdout.write('/usr/lib/node_modules\n');
      child.stderr.write('npm notice\n');
      setImmediate(() => child.emit('close', code));
    });
    return child;
  };
  return start as unknown as StartProgram;
}

function terminal(): { stream: PassThrough; shown(): string } {
  const stream = new PassThrough();
  let shown = '';
  stream.setEncoding('utf8').on('data', (chunk: string) => (shown += chunk));
  return { stream, shown: () => shown };
}

describe('the programs kvman uninstall runs (ADR 0031, 6 to 8)', () => {
  it("QA43-H12 a program starts the platform's way, and only a shown one prints", async () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const started: Started[] = [];
      const output = terminal();
      const result = await programRunner(platform, output.stream, fakeStart(started, 0))('npm', ['root', '-g'], 'captured');
      expect(result, platform).toEqual({ started: true, code: 0, output: '/usr/lib/node_modules\n' });
      expect(started).toEqual([{ program: 'npm', args: ['root', '-g'], options: { stdio: ['ignore', 'pipe', 'pipe'] } }]);
      expect(output.shown()).toBe('');
    }
    const started: Started[] = [];
    const output = terminal();
    const result = await programRunner('win32', output.stream, fakeStart(started, 1))('npm', ['uninstall', '-g', 'kvman'], 'shown');
    expect(result).toEqual({ started: true, code: 1, output: '/usr/lib/node_modules\n' });
    expect(started).toEqual([{ program: 'npm', args: ['uninstall', '-g', 'kvman'], options: { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] } }]);
    expect(output.shown()).toBe('/usr/lib/node_modules\nnpm notice\n');

    const missing = await programRunner('linux', terminal().stream, fakeStart([], 'missing'))('npm', ['root', '-g'], 'captured');
    expect(missing).toEqual({ started: false, code: 1, output: '' });
  });
});

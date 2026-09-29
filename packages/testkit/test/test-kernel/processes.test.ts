import type { Json, Problem } from '@kvman/protocol';
import { createTestKernel, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const probe = new URL('./fixtures/extensions/probe/extension.ts', import.meta.url);
const other = new URL('./fixtures/extensions/other/extension.ts', import.meta.url);

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

function problemOf(error: unknown): Problem {
  if (error instanceof TestkitProblem) return error.problem;
  throw new Error(`expected a TestkitProblem, got ${String(error)}`);
}

function field(value: Json, name: string): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const found = value[name];
    if (found !== undefined) return found;
  }
  throw new Error(`expected ${name} in the reply`);
}

function itemsOf(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  throw new Error('expected an array in the reply');
}

function textOf(value: Json, name: string): string {
  const found = field(value, name);
  if (typeof found === 'string') return found;
  throw new Error(`expected ${name} to be a string`);
}

describe('fake processes (ADR 0166)', { timeout: 60_000 }, () => {
  it('M2.13-E25 a faked command answers its scripted output and lists as ended', async () => {
    const k = await started({
      extensions: [probe],
      processes: { ffmpeg: { stdout: ['frame 1\n', 'frame 2\n'], stderr: ['warn\n'], exitCode: 3 } },
    });
    const result = await k.asUser().command('probe.spawn', { command: 'ffmpeg', args: ['-i', 'x'] });
    expect(result).toMatchObject({ exitCode: 3, signal: null, truncated: false });
    expect(textOf(result, 'tail')).toContain('frame 1\n');
    expect(textOf(result, 'tail')).toContain('frame 2\n');
    expect(textOf(result, 'tail')).toContain('warn\n');
    const listing = await k.asUser().query('kernel.processes.list', {});
    const ffmpeg = itemsOf(field(listing, 'items')).filter((item) => field(item, 'command') === 'ffmpeg');
    expect(ffmpeg).toHaveLength(1);
    expect(ffmpeg[0]).toMatchObject({ extension: '@acme/probe', state: 'exited', exitCode: 3 });
  });

  it('M2.13-E26 a detached fake reports its exit once', async () => {
    const k = await started({
      extensions: [probe],
      processes: { ffmpeg: { stdout: ['frame 1\n', 'frame 2\n'], stderr: ['warn\n'], exitCode: 3 } },
    });
    const spawned = await k.asUser().command('probe.spawn', { command: 'ffmpeg', detached: true });
    const processId = textOf(spawned, 'processId');
    expect(processId.length).toBeGreaterThan(0);
    await vi.waitFor(async () => {
      const exits = itemsOf(field(await k.asUser().query('probe.state.get', {}), 'exits'));
      expect(exits).toHaveLength(1);
    }, { timeout: 10_000 });
    await k.idle();
    const exits = itemsOf(field(await k.asUser().query('probe.state.get', {}), 'exits'));
    expect(exits).toHaveLength(1);
    expect(exits[0]).toMatchObject({ processId, exitCode: 3 });
  });

  it('M2.13-E27 an unlisted command runs for real', async () => {
    const k = await started({ extensions: [probe], processes: { ffmpeg: {} } });
    const result = await k.asUser().command('probe.spawn', { command: process.execPath, args: ['-e', 'process.exit(4)'] });
    expect(result).toMatchObject({ exitCode: 4 });
  });

  it('M2.13-E28 a fake never skips the process capability', async () => {
    const k = await started({ extensions: [probe, other], processes: { ffmpeg: { exitCode: 0 } } });
    const refused = await k.asUser().command('other.spawn', { command: 'ffmpeg' }).catch((error: unknown) => error);
    expect(problemOf(refused).code).toBe('CAPABILITY_DENIED');
  });
});

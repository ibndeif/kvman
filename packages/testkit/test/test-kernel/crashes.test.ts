import type { Json } from '@kvman/protocol';
import { createTestKernel, TestkitError, type CrashPoint, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it } from 'vitest';

const probe = new URL('./fixtures/extensions/probe/extension.ts', import.meta.url);

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

function field(value: Json, name: string): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const found = value[name];
    if (found !== undefined) return found;
  }
  throw new Error(`expected ${name} in the reply`);
}

describe('crash injection (ADR 0166)', { timeout: 60_000 }, () => {
  it('M2.13-E29 a crash before a step reruns it once', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.crashDuring('probe.steps', 'before-step:extract')).toEqual({ value: 7 });
    const state = await k.query('probe.state.get', {});
    expect(field(state, 'runs')).toEqual(['extract', 'store']);
    expect(field(field(state, 'values'), 'result')).toBe(7);
  });

  it('M2.13-E30 a crash after a step reuses its recorded result', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.crashDuring('probe.steps', 'after-step:extract')).toEqual({ value: 7 });
    const state = await k.query('probe.state.get', {});
    expect(field(state, 'runs')).toEqual(['extract', 'store']);
    expect(field(field(state, 'values'), 'result')).toBe(7);
  });

  it('M2.13-E31 a crash before commit writes once', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.crashDuring('probe.steps', 'before-commit')).toEqual({ value: 7 });
    const state = await k.query('probe.state.get', {});
    expect(field(state, 'runs')).toEqual(['extract', 'store']);
    expect(field(field(state, 'values'), 'result')).toBe(7);
  });

  it('M2.13-E32 a point that is never reached leaves the kernel running', async () => {
    const k = await started({ extensions: [probe] });
    const missed = await k.crashDuring('probe.steps', 'after-step:nowhere').then(() => 'crashed', (error: unknown) => error);
    expect(missed).toBeInstanceOf(TestkitError);
    expect(String(missed)).toContain('the point was never reached');
    expect(await k.command('probe.echo', { text: 'still here' })).toMatchObject({ text: 'still here' });
  });

  it('M2.13-E33 an unknown point names the three point forms and sends nothing', async () => {
    const k = await started({ extensions: [probe] });
    const point: CrashPoint = JSON.parse('"during-lunch"');
    const refused = await k.crashDuring('probe.steps', point).then(() => 'crashed', (error: unknown) => error);
    expect(refused).toBeInstanceOf(TestkitError);
    expect(String(refused)).toContain('before-step:');
    expect(String(refused)).toContain('after-step:');
    expect(String(refused)).toContain('before-commit');
    expect(field(await k.query('probe.state.get', {}), 'values')).not.toHaveProperty('result');
  });
});

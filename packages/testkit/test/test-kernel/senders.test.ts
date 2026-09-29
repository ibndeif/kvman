import type { Json, Problem } from '@kvman/protocol';
import { createTestKernel, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it } from 'vitest';

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

describe('senders and results (ADR 0165)', { timeout: 60_000 }, () => {
  it('M2.13-E8 the driver reaches all and extensions types but not user or internal ones', async () => {
    const k = await started({ extensions: [probe, other] });
    expect(await k.command('probe.echo', { text: 'Bo' })).toEqual({ text: 'Bo', locale: 'en', greeting: 'Hello Bo' });
    expect(await k.command('probe.api', {})).toEqual({});
    for (const type of ['probe.admin', 'probe.hidden']) {
      const refused = await k.command(type, {}).catch((error: unknown) => error);
      const problem = problemOf(refused);
      expect(problem.code).toBe('CAPABILITY_DENIED');
      expect(problem.detail ?? '').toContain('@kvman/testkit-driver');
      expect(problem.detail ?? '').toContain(type);
    }
  });

  it('M2.13-E9 the person reaches all and user types but not extensions ones', async () => {
    const k = await started({ extensions: [probe, other] });
    expect(await k.asUser().command('probe.echo', { text: 'Bo' })).toEqual({ text: 'Bo', locale: 'en', greeting: 'Hello Bo' });
    expect(await k.asUser().command('probe.admin', {})).toEqual({});
    const refused = await k.asUser().command('probe.api', {}).catch((error: unknown) => error);
    expect(problemOf(refused).code).toBe('CALLER_NOT_ALLOWED');
  });

  it('M2.13-E10 the locale switch is saved and answers in its language', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.asUser({ locale: 'ar' }).command('probe.echo', { text: 'Ali' }))
      .toEqual({ text: 'Ali', locale: 'ar', greeting: 'مرحبا Ali' });
    expect(await k.asUser().command('probe.echo', { text: 'Ali' }))
      .toEqual({ text: 'Ali', locale: 'ar', greeting: 'مرحبا Ali' });
    expect(await k.asUser().query('kernel.user.preferences.get', {})).toMatchObject({ locale: 'ar' });
    expect(await k.asUser({ locale: 'en' }).command('probe.echo', { text: 'Ali' }))
      .toEqual({ text: 'Ali', locale: 'en', greeting: 'Hello Ali' });
  });

  it('M2.13-E11 both senders read the query and an unknown type is not found', async () => {
    const k = await started({ extensions: [probe] });
    const state = await k.query('probe.state.get', {});
    expect(await k.asUser().query('probe.state.get', {})).toEqual(state);
    expect(field(state, 'runs')).toEqual([]);
    const missing = await k.query('probe.nothing', {}).catch((error: unknown) => error);
    expect(problemOf(missing).code).toBe('TYPE_NOT_FOUND');
  });

  it('M2.13-E12 a registered code arrives as a problem with its title', async () => {
    const k = await started({ extensions: [probe] });
    const failed = await k.command('probe.fail', { code: 'probe/NOPE' }).catch((error: unknown) => error);
    const problem = problemOf(failed);
    expect(problem.code).toBe('probe/NOPE');
    expect(problem.title).toBe('Probe refused on purpose');
    await k.close();
  });
});

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unregisteredCodeMessage, type LogRecord } from '@kvman/kernel';
import type { Json, Problem } from '@kvman/protocol';
import { createTestKernel, TestkitError, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { openInstallFixture, problemOf as installProblemOf, type InstallFixture } from '../install/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { workspaceA } from '../hosts/harness.ts';
import { enable, grantsOf, run, valueOf } from '../workspaces/harness.ts';
import probeDefinition from './fixtures/extensions/probe/extension.ts';

const probe = new URL('./fixtures/extensions/probe/extension.ts', import.meta.url);
const other = new URL('./fixtures/extensions/other/extension.ts', import.meta.url);

const kernels: TestKernel[] = [];
let holder: InstallFixture | undefined;

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
  await holder?.close();
  holder = undefined;
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

function textOf(value: Json, name: string): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && name in value) {
    const found = value[name];
    if (typeof found === 'string') return found;
  }
  throw new Error(`expected ${name} to be a string`);
}

describe('unregistered error codes (ADR 0166)', { timeout: 60_000 }, () => {
  it('M2.13-H4 failing with an unregistered code throws a TestkitError and reports it', async () => {
    const k = await started({ extensions: [probe] });
    const failed = await k.command('probe.fail', { code: 'probe/UNLISTED' }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(TestkitError);
    expect(failed).not.toBeInstanceOf(TestkitProblem);
    expect(String(failed)).toContain('@acme/probe');
    expect(String(failed)).toContain('probe.fail');
    expect(String(failed)).toContain('probe/UNLISTED');
    await k.close();
  });

  it('M2.13-E18 an unregistered code from a subscription fails idle', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.command('probe.ping', { explode: true })).toEqual({});
    const stalled = await k.idle().then(() => 'settled', (error: unknown) => error);
    expect(stalled).toBeInstanceOf(TestkitError);
    expect(String(stalled)).toContain('@acme/probe');
    expect(String(stalled)).toContain('probe.pinged');
    expect(String(stalled)).toContain('probe/UNLISTED');
  });

  it('M2.13-E19 close reports an unregistered code no call reported and still deletes its home', async () => {
    const k = await started({ extensions: [probe] });
    const home = textOf(await k.asUser().query('kernel.health.get', {}), 'home');
    expect(await k.command('probe.ping', { explode: true })).toEqual({});
    const closed = await k.close().then(() => 'closed', (error: unknown) => error);
    expect(closed).toBeInstanceOf(TestkitError);
    expect(String(closed)).toContain('@acme/probe');
    expect(String(closed)).toContain('probe.pinged');
    expect(String(closed)).toContain('probe/UNLISTED');
    expect(existsSync(home)).toBe(false);
  });

  it('M2.13-E20 a relayed foreign code stays a problem and raises no TestkitError', async () => {
    const k = await started({ extensions: [probe, other] });
    const relayed = await k.command('probe.relay', { type: 'other.fail' }).catch((error: unknown) => error);
    expect(problemOf(relayed).code).toBe('other/BROKEN');
    await k.close();
  });

  it('M2.13-E21 the kernel warns once for an unregistered code and never for registered or kernel codes', async () => {
    const fixture = await openInstallFixture();
    holder = fixture;
    const folder = fileURLToPath(new URL('./fixtures/extensions/probe/', import.meta.url));
    await installFixture(fixture.connection, fixture.home, { definition: probeDefinition, folder, entry: 'extension.ts' });
    fixture.runtime.registry.refresh();
    valueOf(await enable(fixture, workspaceA, '@acme/probe', grantsOf(fixture, '@acme/probe', 'shared')));
    expect(installProblemOf(await run(fixture, 'probe.fail', { code: 'probe/UNLISTED' }, workspaceA)).code).toBe('probe/UNLISTED');
    const warnings = (): LogRecord[] => fixture.logged.filter((record) => record.message === unregisteredCodeMessage);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatchObject({
      level: 'warn',
      fields: { code: 'probe/UNLISTED', type: 'probe.fail' },
      attributes: expect.objectContaining({ extension: '@acme/probe' }),
    });
    expect(warnings()[0]).not.toHaveProperty('payload');
    expect(installProblemOf(await run(fixture, 'probe.fail', { code: 'probe/NOPE' }, workspaceA)).code).toBe('probe/NOPE');
    expect(warnings()).toHaveLength(1);
    const broken = await run(fixture, 'probe.broken', {}, workspaceA);
    expect(broken.ok).toBe(false);
    if (broken.ok) throw new Error('probe.broken was expected to fail');
    expect(broken.problem.detail ?? '').toContain('INTERNAL');
    expect(warnings()).toHaveLength(1);
  });
});

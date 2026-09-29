import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Json } from '@kvman/protocol';
import { createTestKernel, TestkitError, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
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

function modeNow(): 'shared' | 'sandboxed' {
  return process.env['KVMAN_TESTKIT_ISOLATION'] === 'sandboxed' ? 'sandboxed' : 'shared';
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

describe('starting and closing the test kernel (ADR 0165)', { timeout: 60_000 }, () => {
  it('M2.13-E1 starts Probe, Other, and the driver in one workspace with their grants', async () => {
    const k = await started({ extensions: [probe, other] });
    const mode = modeNow();
    expect(k.workspaceId.length).toBeGreaterThan(0);
    const listed = await k.asUser().query('kernel.extensions.list', {});
    expect(itemsOf(listed)).toHaveLength(3);
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '@acme/probe', enabledIn: [k.workspaceId], isolation: { [k.workspaceId]: mode } }),
      expect.objectContaining({ name: '@acme/other', enabledIn: [k.workspaceId], isolation: { [k.workspaceId]: mode } }),
      expect.objectContaining({ name: '@kvman/testkit-driver', enabledIn: [k.workspaceId], isolation: { [k.workspaceId]: mode } }),
    ]));
    expect(textOf(await k.asUser().query('probe.state.get', {}), 'workspacePath')).toContain('kvman-testkit-workspace-');
    const probeGet = await k.asUser().query('kernel.extension.get', { name: '@acme/probe' });
    expect(field(probeGet, 'grants')).toEqual({
      [k.workspaceId]: {
        isolation: mode,
        requested: [{ name: 'ui' }, { name: 'process' }, { name: 'files.read' }, { name: 'files.write' }, { name: 'calls', types: ['other.*'] }],
        derived: { subscribes: [], providesLlm: [] },
      },
    });
    const otherGet = await k.asUser().query('kernel.extension.get', { name: '@acme/other' });
    expect(field(otherGet, 'grants')).toEqual({
      [k.workspaceId]: { isolation: mode, requested: [], derived: { subscribes: [], providesLlm: [] } },
    });
    const driverGet = await k.asUser().query('kernel.extension.get', { name: '@kvman/testkit-driver' });
    expect(field(driverGet, 'grants')).toEqual({
      [k.workspaceId]: {
        isolation: mode,
        requested: [{ name: 'calls', types: ['other.*', 'probe.*'] }],
        derived: { subscribes: [], providesLlm: [] },
      },
    });
  });

  it('M2.13-E2 opens the given workspace folder and leaves it on close', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'kvman-e2-'));
    const k = await started({ extensions: [probe], workspace: folder });
    expect(await k.asUser().query('kernel.workspace.get', { workspaceId: k.workspaceId })).toMatchObject({ path: folder });
    await k.close();
    expect(existsSync(folder)).toBe(true);
    rmSync(folder, { recursive: true, force: true });
  });

  it('M2.13-E3 rejects a module without a default export and a nondeterministic setup', async () => {
    const noDefault = new URL('./fixtures/extensions/no-default/extension.ts', import.meta.url);
    const drift = new URL('./fixtures/extensions/drift/extension.ts', import.meta.url);
    const missing = await createTestKernel({ extensions: [noDefault] }).then(() => 'started', (error: unknown) => error);
    expect(missing).toBeInstanceOf(TestkitError);
    expect(String(missing)).toContain('EXT_MANIFEST_INVALID');
    const drifting = await createTestKernel({ extensions: [drift] }).then(() => 'started', (error: unknown) => error);
    expect(drifting).toBeInstanceOf(TestkitError);
    expect(String(drifting)).toContain('EXT_MANIFEST_INVALID');
    expect(String(drifting)).toContain('second run');
  });

  it('M2.13-E4 rejects an unknown isolation value from the environment', async () => {
    const previous = process.env['KVMAN_TESTKIT_ISOLATION'];
    process.env['KVMAN_TESTKIT_ISOLATION'] = 'quiet';
    try {
      const rejected = await createTestKernel({ extensions: [] }).then(() => 'started', (error: unknown) => error);
      expect(rejected).toBeInstanceOf(TestkitError);
      expect(String(rejected)).toContain('shared');
      expect(String(rejected)).toContain('sandboxed');
    } finally {
      if (previous === undefined) delete process.env['KVMAN_TESTKIT_ISOLATION'];
      else process.env['KVMAN_TESTKIT_ISOLATION'] = previous;
    }
  });

  it('M2.13-E5 grants a dedicated request at the mode isolation', async () => {
    const dedicated = new URL('./fixtures/extensions/dedicated/extension.ts', import.meta.url);
    const sandboxed = await started({ extensions: [dedicated], isolation: 'sandboxed' });
    const sandboxedGet = await sandboxed.asUser().query('kernel.extension.get', { name: '@acme/dedicated' });
    expect(field(field(sandboxedGet, 'grants'), sandboxed.workspaceId)).toMatchObject({ isolation: 'sandboxed' });
    const sandboxedVersions = itemsOf(field(sandboxedGet, 'versions'));
    expect(sandboxedVersions).toHaveLength(1);
    expect(textOf(sandboxedVersions[0] ?? {}, 'source').startsWith('local:')).toBe(true);
    const shared = await started({ extensions: [dedicated], isolation: 'shared' });
    const sharedGet = await shared.asUser().query('kernel.extension.get', { name: '@acme/dedicated' });
    expect(field(field(sharedGet, 'grants'), shared.workspaceId)).toMatchObject({ isolation: 'shared' });
    const sharedVersions = itemsOf(field(sharedGet, 'versions'));
    expect(sharedVersions).toHaveLength(1);
    expect(textOf(sharedVersions[0] ?? {}, 'source')).toBe('builtin:@acme/dedicated');
  });

  it('M2.13-E6 closing deletes its folders and leaves another kernel running', async () => {
    const first = await started({ extensions: [probe] });
    const second = await started({ extensions: [probe] });
    const home = textOf(await first.asUser().query('kernel.health.get', {}), 'home');
    const workspace = textOf(await first.asUser().query('probe.state.get', {}), 'workspacePath');
    await first.close();
    expect(existsSync(home)).toBe(false);
    expect(existsSync(workspace)).toBe(false);
    expect(await second.command('probe.echo', { text: 'hi' })).toMatchObject({ text: 'hi' });
  });

  it('M2.13-E7 a sandboxed peek at a test file fails without naming its path', async () => {
    const k = await started({ extensions: [probe], isolation: 'sandboxed' });
    const folder = mkdtempSync(join(tmpdir(), 'kvman-peek-'));
    const file = join(folder, 'note.txt');
    writeFileSync(file, 'notes for the peek');
    try {
      const refused = await k.asUser().command('probe.peek', { path: file }).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(TestkitProblem);
      if (refused instanceof TestkitProblem) {
        expect(refused.problem.code).toBe('CAPABILITY_DENIED');
        expect(refused.problem.detail ?? '').toContain('a file read');
        expect(`${refused.problem.detail ?? ''} ${refused.problem.hint ?? ''}`).not.toContain(file);
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

import { jsonObjectSchema } from '@kvman/protocol';
import { describe, expect, it, vi } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome, type ChildKernel } from '../child-kernel/launch.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { notesName } from './child-harness.ts';

type Memory = { heapUsed: number; shared: number[] };

async function memoryOf(kernel: ChildKernel): Promise<Memory> {
  const answer = jsonObjectSchema.parse(await kernel.ask('memory'));
  const hosts = [answer['hosts']].flat().map((host) => jsonObjectSchema.parse(host));
  return { heapUsed: Number(answer['heapUsed']), shared: hosts.filter((host) => host['isolation'] === 'shared').map((host) => Number(host['threadId'])) };
}

// One reload of Notes without a digest, then one query answered by the new code.
async function reloadAndAsk(kernel: ChildKernel): Promise<void> {
  expect((await command(kernel.port, 'kernel.extension.reload', { name: notesName }, { wait: 60_000 })).status).toBe(200);
  const answer = await send(kernel.port, 'POST', '/api/v1/queries/notes.version.get', { body: { payload: {}, workspaceId: fixtureWorkspace }, headers: { 'x-kvman-client': 'tests' } });
  expect(answer.json).toEqual({ data: { version: '1.0.0' } });
}

describe('hot reloads of a shared extension (plan 06 §6.6 step 5, ADR 0145)', { timeout: 240_000 }, () => {
  it('M2.7-H8 20 hot reloads of a shared extension return the pool to its baseline', async () => {
    const kernel = await launchKernel({ home: temporaryHome(), fixture: 'notes-shared', execArgv: ['--expose-gc'] });
    try {
      await measured(kernel);
    } finally {
      expect(await kernel.stop()).toEqual({ code: 0, signal: null });
    }
  });
});

// The baseline after one reload, then 20 more reloads, then the pool and heap once the replaced workers exited.
async function measured(kernel: ChildKernel): Promise<void> {
  await reloadAndAsk(kernel);
  const baseline = await memoryOf(kernel);
  const replaced = new Set<number>();
  for (let round = 0; round < 20; round += 1) {
    for (const threadId of (await memoryOf(kernel)).shared) replaced.add(threadId);
    await reloadAndAsk(kernel);
  }
  // Retired workers stop once their invocations end; thread termination completes asynchronously.
  const final = await vi.waitFor(async () => {
    const memory = await memoryOf(kernel);
    expect(memory.shared.some((threadId) => replaced.has(threadId))).toBe(false);
    expect(memory.shared.length).toBeLessThanOrEqual(baseline.shared.length);
    return memory;
  }, { timeout: 60_000, interval: 100 });
  expect(final.heapUsed - baseline.heapUsed).toBeLessThan(10 * 1024 * 1024);
}

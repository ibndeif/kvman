import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestKernel, type TestKernel } from '@kvman/testkit';

// A stopped step changes nothing (ADR 0118, 5): the fence, run in a real store transaction by a fixture extension, for a
// call from the current step, from a step that was stopped, from no step, and for a session that is gone or going.

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { requireCurrentStep } from ${source('files/change-fence.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
  ctx.registerCommand('fencechecks.check', { public: true, output: z.string(), description: 'Runs the fence for one case.',
    input: z.object({ case: z.enum(['current', 'stopped', 'unrelated', 'missing', 'deleting']) }),
    handle: (input) => ctx.store.transaction((tx) => {
      const store = txRecords(tx), stamp = new Date().toISOString(), root = ctx.job.rootId;
      const session = store.sessions.insert({ title: 'fence', autoTitle: false, deleting: input.case === 'deleting', status: 'running', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: input.case === 'current' ? root : 'another-job', turnId: 'turn', endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp });
      if (input.case === 'stopped') store.stepIntents.insert({ sessionId: session.id, turnId: 'turn', generation: 1, phase: 'settled', jobId: root, legacyJobId: null, reason: null, createdAt: stamp, updatedAt: stamp });
      try {
        requireCurrentStep(ctx, store, input.case === 'missing' ? 'no-such-session' : session.id, 'a.txt');
        return 'allowed';
      } catch (error) {
        if (error instanceof ProblemError) return error.problem.code + ': ' + error.problem.message;
        throw error;
      }
    }) });
};
`;

let kernel: TestKernel | undefined;
let root: string | undefined;
afterEach(async () => {
  try {
    await kernel?.close();
  } finally {
    kernel = undefined;
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  }
});
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'fencechecks-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/fencechecks', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'fencechecks', source: 'index.ts', dependencies: {} } }));
  writeFileSync(path.join(root, 'index.ts'), entry);
  kernel = await createTestKernel({ extensions: [root] });
});

const check = async (which: string): Promise<unknown> => {
  if (kernel === undefined) throw new Error('kernel not started');
  return kernel.exec('fencechecks.check', { case: which });
};
const stopped = 'VALIDATION_FAILED: This step was stopped, so nothing was written.';

describe('a stopped step changes nothing (ADR 0118, 5)', () => {
  it('QA77-E13 the current step and a call from no step may change; a stopped step, a gone session, and a deleting one may not', async () => {
    expect(await check('current')).toBe('allowed');
    expect(await check('unrelated')).toBe('allowed');
    expect(await check('stopped')).toBe(stopped);
    expect(await check('missing')).toBe(stopped);
    expect(await check('deleting')).toBe(stopped);
  });
});

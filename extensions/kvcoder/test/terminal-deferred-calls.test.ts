import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { describe, expect, it } from 'vitest';

const source = (file: string) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href);
const entry = `
import { z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, turnDocSchema, outcomeSchema } from ${source('schemas/records.ts')};
import { prepareStep, claimStep } from ${source('turns/step-intents.ts')};
import { endTurnState } from ${source('turns/end-turn-state.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
  ctx.registerCommand('terminalchecks.probe', {
    public: true, description: 'Checks transactional deferred-call terminal invalidation.',
    input: z.object({ outcome: outcomeSchema, mode: z.enum(['terminal', 'rollback', 'stale']) }), output: z.json(),
    handle: async input => {
      const seed = await ctx.store.transaction(tx => {
        const store = txRecords(tx), stamp = new Date().toISOString();
        const session = store.sessions.insert(sessionDocSchema.parse({ title: 'Terminal', autoTitle: false,
          status: 'idle', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null,
          stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage,
          durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp,
        }));
        const makeTurn = (toolCallId: string) => store.turns.insert(turnDocSchema.parse({
          sessionId: session.id, startedAt: stamp, endedAt: null, durationMs: 0, steps: 0, lost: 0, usage,
          outcome: null, calls: [{ toolCallId, toolName: 'run' }], pending: [], results: [],
          deferredCalls: [{ toolCallId, call: { description: 'Delayed write', connector: 'fs', command: 'write',
            payload: { path: 'not-created.txt', content: 'Must never execute', risky: false } } }],
        }));
        const original = makeTurn('original');
        store.sessions.update(session.id, { status: 'running', turnId: original.id });
        const identity = prepareStep(store, session.id, original.id);
        const lease = { ...identity, jobId: 'canonical-job' };
        if (claimStep(store, identity, lease.jobId) === undefined) throw new Error('Fixture claim failed');
        const current = input.mode === 'stale' ? makeTurn('newer') : original;
        if (current.id !== original.id) store.sessions.update(session.id, { turnId: current.id });
        return { sessionId: session.id, originalId: original.id, currentId: current.id, lease };
      });
      let ended = false, rolledBack = false;
      try {
        ended = await ctx.store.transaction(tx => {
          const by = input.outcome === 'cancelled' ? 'cancel' : input.outcome === 'failed' || input.outcome === 'interrupted' ? 'handler' : 'step';
          const result = endTurnState(txRecords(tx), seed.sessionId, seed.originalId, input.outcome, by, undefined,
            by === 'step' ? seed.lease : undefined);
          if (input.mode === 'rollback') throw new Error('ROLL_BACK_TERMINAL');
          return result !== undefined;
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'ROLL_BACK_TERMINAL') throw error;
        rolledBack = true;
      }
      return ctx.store.transaction(tx => {
        const store = txRecords(tx);
        const read = (id: string) => {
          const turn = store.turns.get(id);
          if (turn === undefined) throw new Error('Fixture turn disappeared');
          return { outcome: turn.outcome, deferred: turn.deferredCalls.map(item => item.toolCallId) };
        };
        return { ended, rolledBack, original: read(seed.originalId), current: read(seed.currentId) };
      });
    },
  });
};
`;
const outcomes = ['done', 'cancelled', 'failed', 'interrupted', 'maxSteps'] as const;
const output = z.object({ ended: z.boolean(), rolledBack: z.boolean(),
  original: z.object({ outcome: z.enum(outcomes).nullable(), deferred: z.array(z.string()) }),
  current: z.object({ outcome: z.enum(outcomes).nullable(), deferred: z.array(z.string()) }),
});
async function probe(outcome: typeof outcomes[number], mode: 'terminal' | 'rollback' | 'stale') {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-terminal-deferred-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/terminalchecks', version: '0.1.0',
      type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' },
      kvman: { namespace: 'terminalchecks', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    return output.parse(await kernel.exec('terminalchecks.probe', { outcome, mode }));
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

describe('M2.4-E127 terminal deferred-call invalidation slice', () => {
  for (const outcome of outcomes) {
    it(`${outcome} discards deferred calls in its actual terminal transaction`, async () => {
      const result = await probe(outcome, 'terminal');
      expect(result).toEqual({ ended: true, rolledBack: false,
        original: { outcome, deferred: [] }, current: { outcome, deferred: [] } });
    });
  }
  it('rolls deferred calls and terminal state back together', async () => {
    const result = await probe('cancelled', 'rollback');
    expect(result).toEqual({ ended: false, rolledBack: true,
      original: { outcome: null, deferred: ['original'] }, current: { outcome: null, deferred: ['original'] } });
  });
  it('does not clear deferred calls or end either turn through a stale terminal writer', async () => {
    const result = await probe('cancelled', 'stale');
    expect(result).toEqual({ ended: false, rolledBack: false,
      original: { outcome: null, deferred: ['original'] }, current: { outcome: null, deferred: ['newer'] } });
  });
});

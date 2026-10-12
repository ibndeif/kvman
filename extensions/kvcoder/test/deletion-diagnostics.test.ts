import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';

const source = (file: string) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href);
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, turnDocSchema } from ${source('schemas/records.ts')};
import { prepareStep, preparedStep, claimStep } from ${source('turns/step-intents.ts')};
import { recoveryState, interruptUncertain } from ${source('turns/recovery-state.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
  ctx.registerCommand('diagnosticchecks.probe', {
    public: true, description: 'Retains uncertain ownership without execution under deletion.',
    input: z.object({ ancestor: z.enum(['leaf', 'branch', 'root']), savedJob: z.boolean() }), output: z.json(),
    handle: input => ctx.store.transaction(tx => {
      const store = txRecords(tx), stamp = new Date().toISOString();
      const make = (parentId: string | null) => store.sessions.insert(sessionDocSchema.parse({
        title: 'unchanged', autoTitle: false, status: 'idle', parentId, worker: null, model: null, thinking: 'off',
        stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage,
        durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp,
      }));
      const root = make(null), branch = make(root.id), leaf = make(branch.id);
      const turn = store.turns.insert(turnDocSchema.parse({ sessionId: leaf.id, startedAt: stamp, endedAt: null,
        durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [],
      }));
      store.sessions.update(leaf.id, { status: 'running', turnId: turn.id });
      const original = prepareStep(store, leaf.id, turn.id);
      // No unsettled row proves ownership of this modern saved reference.
      store.stepIntents.update(original.intentId, { phase: 'settled' });
      store.sessions.update(leaf.id, { stepJobId: input.savedJob ? 'unknown-candidate' : null });
      store.sessions.update({ root: root.id, branch: branch.id, leaf: leaf.id }[input.ancestor], { deleting: true });
      const current = recoveryState(store, leaf.id);
      if (current === undefined) throw new Error('Missing diagnostic candidate');
      let error = null;
      try { interruptUncertain(store, current, 'STEP_EFFECTS_UNKNOWN'); }
      catch (failure) { if (!(failure instanceof ProblemError)) throw failure; error = failure.problem.code; }
      const intents = store.stepIntents.find({ sessionId: leaf.id }, { limit: 1000 });
      const diagnostic = intents.find(item => item.phase === 'needs-review');
      const replayable = diagnostic === undefined ? false : claimStep(store, {
        sessionId: leaf.id, turnId: turn.id, intentId: diagnostic.id, generation: diagnostic.generation,
      }, 'must-not-run') !== undefined;
      return { error, session: store.sessions.get(leaf.id), turn: store.turns.get(turn.id), intents,
        replayable, prepared: preparedStep(store, leaf.id, turn.id) !== undefined,
        notices: store.messages.count({ sessionId: leaf.id, kind: 'notice' }) };
    }),
  });
};
`;
const resultSchema = z.object({
  error: z.string().nullable(), session: z.object({ status: z.string(), turnId: z.string().nullable(), stepJobId: z.string().nullable() }),
  turn: z.object({ outcome: z.string().nullable() }),
  intents: z.array(z.object({ phase: z.string(), jobId: z.string().nullable(), legacyJobId: z.string().nullable(), reason: z.string().nullable() })),
  replayable: z.boolean(), prepared: z.boolean(), notices: z.number(),
});
async function probe(ancestor: 'leaf' | 'branch' | 'root', savedJob: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-deletion-diagnostics-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/diagnosticchecks', version: '0.1.0',
      type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' },
      kvman: { namespace: 'diagnosticchecks', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    return resultSchema.parse(await kernel.exec('diagnosticchecks.probe', { ancestor, savedJob }));
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

describe('deleting ancestry preserves uncertain diagnostics without effect authority', () => {
  for (const ancestor of ['leaf', 'branch', 'root'] as const) for (const savedJob of [false, true]) {
    it(`${ancestor} deletion retains a modern diagnostic with ${savedJob ? 'saved job' : 'null job'}`, async () => {
      const result = await probe(ancestor, savedJob);
      expect(result).toMatchObject({ error: null, session: { status: 'idle', turnId: null, stepJobId: null },
        turn: { outcome: 'interrupted' }, replayable: false, prepared: false, notices: 1 });
      expect(result.intents).toEqual([
        { phase: 'settled', jobId: null, legacyJobId: null, reason: null },
        { phase: 'needs-review', jobId: savedJob ? 'unknown-candidate' : null, legacyJobId: null, reason: 'STEP_EFFECTS_UNKNOWN' },
      ]);
    });
  }
});

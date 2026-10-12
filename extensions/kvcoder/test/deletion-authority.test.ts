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
import { prepareStep, preparedStep, claimStep, publishStep, liveStep, invalidateStep } from ${source('turns/step-intents.ts')};
import { grantsInTx, type GrantPreparation } from ${source('prompt/session-grants.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
const prepared: GrantPreparation = { connectors: { loaded: new Set(), binaries: [] }, servers: [], workers: [], disabled: [] };
export default (ctx: Ctx): void => {
  ctx.registerCommand('deletionchecks.probe', {
    public: true, description: 'Exercises deletion ancestry against actual transaction authority.',
    input: z.object({ ancestor: z.enum(['leaf', 'branch', 'root']), claimed: z.boolean(), beforePrepare: z.boolean() }), output: z.json(),
    handle: input => ctx.store.transaction(tx => {
      const store = txRecords(tx), stamp = new Date().toISOString();
      const session = (parentId: string | null) => store.sessions.insert(sessionDocSchema.parse({
        title: 'unchanged', autoTitle: false, status: 'idle', parentId, worker: null, model: null, thinking: 'off',
        stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage,
        durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp,
      }));
      const root = session(null), branch = session(root.id), leaf = session(branch.id);
      const turn = store.turns.insert(turnDocSchema.parse({ sessionId: leaf.id, startedAt: stamp, endedAt: null,
        durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [],
      }));
      store.sessions.update(leaf.id, { status: 'running', turnId: turn.id });
      const raw = tx.collection('sessions', z.record(z.string(), z.json()));
      const deletingId = { root: root.id, branch: branch.id, leaf: leaf.id }[input.ancestor];
      const markDeleting = () => { raw.update(deletingId, { deleting: true }); return raw.get(deletingId)?.['deleting']; };
      let physicallyDeleting = input.beforePrepare ? markDeleting() : null;
      let identity;
      let error = null;
      try { identity = prepareStep(store, leaf.id, turn.id); }
      catch (failure) { if (!(failure instanceof ProblemError)) throw failure; error = failure.problem.code; }
      if (identity !== undefined && input.claimed) claimStep(store, identity, 'winner');
      if (!input.beforePrepare) physicallyDeleting = markDeleting();
      const current = store.sessions.get(leaf.id);
      if (current === undefined) throw new Error('Leaf missing');
      const grants = grantsInTx(store, current, prepared) !== undefined;
      const ready = preparedStep(store, leaf.id, turn.id) !== undefined;
      const published = identity === undefined ? false : publishStep(store, identity, 'winner');
      const claimed = identity === undefined ? false : claimStep(store, identity, 'winner') !== undefined;
      const writable = identity === undefined ? false : liveStep(store, identity, 'winner') !== undefined;
      if (writable) store.sessions.update(leaf.id, { title: 'effect' });
      // Teardown still invalidates the exact saved identity even after its execution fence closed.
      const cancelled = identity === undefined ? null : invalidateStep(store, identity, 'CANCEL_REQUESTED');
      return { grants, ready, published, claimed, writable, cancelled, error,
        title: store.sessions.get(leaf.id)?.title, generation: store.sessions.get(leaf.id)?.stepGeneration,
        intents: store.stepIntents.find({ sessionId: leaf.id }, { limit: 1000 }),
        physicallyDeleting };
    }),
  });
};
`;
const resultSchema = z.object({
  grants: z.boolean(), ready: z.boolean(), published: z.boolean(), claimed: z.boolean(), writable: z.boolean(),
  cancelled: z.string().nullable(), error: z.string().nullable(), title: z.string(), generation: z.number(),
  intents: z.array(z.object({ phase: z.string() })), physicallyDeleting: z.literal(true),
});
async function probe(ancestor: 'leaf' | 'branch' | 'root', claimed: boolean, beforePrepare = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-deletion-authority-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/deletionchecks', version: '0.1.0',
      type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' },
      kvman: { namespace: 'deletionchecks', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    return resultSchema.parse(await kernel.exec('deletionchecks.probe', { ancestor, claimed, beforePrepare }));
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

describe('E121/E126 deleting ancestry closes execution, not exact teardown', () => {
  for (const ancestor of ['leaf', 'branch', 'root'] as const) {
    for (const claimed of [false, true]) {
      it(`${ancestor} deletion fences a ${claimed ? 'claimed' : 'prepared'} identity`, async () => {
        const result = await probe(ancestor, claimed);
        expect(result).toMatchObject({ grants: false, ready: false, published: false, claimed: false, writable: false,
          title: 'unchanged', generation: 1, error: null });
        expect(result.intents).toEqual([{ phase: 'invalidated' }]);
        expect(result.cancelled).toBe(claimed ? 'winner' : null);
      });
    }
    it(`${ancestor} deletion prevents new effect authority before preparation`, async () => {
      const result = await probe(ancestor, false, true);
      expect(result).toMatchObject({ grants: false, ready: false, published: false, claimed: false, writable: false,
        title: 'unchanged', generation: 0, error: 'VALIDATION_FAILED', cancelled: null });
      expect(result.intents).toEqual([]);
    });
  }
});

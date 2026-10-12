import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { describe, expect, it } from 'vitest';

// The product's own turn-end transition on native SQLite: one transaction ends a helper's turn and delivers its result.
const source = (file: string) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href);
const entry = `
import { z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, turnDocSchema } from ${source('schemas/records.ts')};
import { appendMessage } from ${source('turns/history.ts')};
import { prepareStep, claimStep } from ${source('turns/step-intents.ts')};
import { endTurnState } from ${source('turns/end-turn-state.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
export default (ctx: Ctx): void => {
  ctx.registerCommand('deliverychecks.probe', {
    public: true, description: 'Ends a helper turn through the product transition.',
    input: z.object({ mode: z.enum(['commit', 'rollback', 'twice', 'background']) }), output: z.json(),
    handle: async ({ mode }) => {
      const seed = await ctx.store.transaction(tx => {
        const store = txRecords(tx), stamp = new Date().toISOString();
        const make = (parentId: string | null) => store.sessions.insert(sessionDocSchema.parse({ title: 'T', autoTitle: false, deleting: false,
          status: 'idle', parentId, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null,
          turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp }));
        const turn = (sessionId: string, waitsOn: string | null) => store.turns.insert(turnDocSchema.parse({ sessionId, startedAt: stamp, endedAt: null,
          durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: waitsOn === null ? [] : [{ toolCallId: 'call', toolName: 'run' }],
          pending: waitsOn === null ? [] : [{ toolCallId: 'call', kind: 'subagent', questionId: null, question: null, childSessionId: waitsOn, runId: null }],
          results: [], deferredCalls: [] }));
        const parent = make(null), child = make(parent.id);
        if (mode === 'background') store.background.insert({ sessionId: parent.id, ref: child.id, kind: 'subagent', call: 'Helper', startedAt: stamp });
        else store.sessions.update(parent.id, { status: 'waiting', turnId: turn(parent.id, child.id).id });
        const childTurn = turn(child.id, null);
        const running = store.sessions.update(child.id, { status: 'running', turnId: childTurn.id });
        appendMessage(store, running, { kind: 'assistant', content: { role: 'assistant', content: [{ type: 'text', text: 'child answer' }] }, turnId: childTurn.id });
        const identity = prepareStep(store, child.id, childTurn.id);
        const lease = { ...identity, jobId: 'child-job' };
        if (claimStep(store, identity, lease.jobId) === undefined) throw new Error('Fixture claim failed');
        return { parentId: parent.id, childId: child.id, childTurnId: childTurn.id, lease };
      });
      const end = () => ctx.store.transaction(tx => {
        const ended = endTurnState(txRecords(tx), seed.childId, seed.childTurnId, 'done', 'step', undefined, seed.lease);
        if (mode === 'rollback') throw new Error('ROLL_BACK');
        return ended === undefined ? null : Object.keys(ended.delivery ?? {});
      });
      const delivered = [await end().catch((error: unknown) => (error instanceof Error ? error.message : 'error'))];
      if (mode === 'twice') delivered.push(await end());
      return ctx.store.transaction(tx => {
        const store = txRecords(tx), parent = store.sessions.get(seed.parentId);
        const turns = store.turns.find({ sessionId: seed.parentId }, { limit: 10 });
        return { delivered, child: store.turns.get(seed.childTurnId)?.outcome ?? null, parentStatus: parent?.status, prepared: parent?.stepIntentId !== null,
          pending: turns.flatMap(found => found.pending.map(item => item.toolCallId)), results: turns.flatMap(found => found.results.map(item => item.text)),
          messages: store.messages.find({ sessionId: seed.parentId }, { limit: 10 }).map(message => [message.kind, message.source?.kind ?? null]), turns: turns.length };
      });
    },
  });
};
`;
const output = z.object({ delivered: z.array(z.union([z.array(z.string()), z.string(), z.null()])), child: z.string().nullable(), parentStatus: z.string(), prepared: z.boolean(),
  pending: z.array(z.string()), results: z.array(z.string()), messages: z.array(z.tuple([z.string(), z.string().nullable()])), turns: z.number() });

async function probe(mode: 'commit' | 'rollback' | 'twice' | 'background') {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-helper-delivery-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/deliverychecks', version: '0.1.0', type: 'module', main: 'index.js',
      peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'deliverychecks', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
    return output.parse(await kernel.exec('deliverychecks.probe', { mode }));
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

describe("a helper's end and its delivery are one transaction (KVC-06, ADR 0052)", () => {
  it('M2.4-E124 the transaction that ends the helper resolves the call that waits on it and prepares the next step', async () => {
    expect(await probe('commit')).toEqual({ delivered: [['step']], child: 'done', parentStatus: 'running', prepared: true, pending: [], results: ['child answer'], messages: [], turns: 1 });
  });

  it('M2.4-E124 a fault in that transaction leaves neither the end nor the delivery', async () => {
    expect(await probe('rollback')).toEqual({ delivered: ['ROLL_BACK'], child: null, parentStatus: 'waiting', prepared: false, pending: ['call'], results: [], messages: [], turns: 1 });
  });

  it('M2.4-E124 ending twice delivers once', async () => {
    expect(await probe('twice')).toMatchObject({ delivered: [['step'], null], child: 'done', results: ['child answer'] });
  });

  it("M2.4-E125 a background helper's end appends its message and opens the idle parent's turn together", async () => {
    expect(await probe('background')).toEqual({ delivered: [['turn']], child: 'done', parentStatus: 'running', prepared: true, pending: [], results: [], messages: [['user', 'subagent']], turns: 1 });
  });
});

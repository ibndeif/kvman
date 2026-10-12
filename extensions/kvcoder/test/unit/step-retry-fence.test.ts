import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';

const source = (file: string) => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);
const identitySchema = z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() });
const entry = `
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { prepareStep, invalidateStep } from ${source('turns/step-intents.ts')};
import { claimStepInput, stepInputSchema } from ${source('turns/step-claim.ts')};
import { completeWithRetries } from ${source('turns/model-retry.ts')};
const identity = z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string(), generation: z.number() });
export default (ctx: Ctx): void => {
  const common = { description: 'Isolated retry authority fixture.', public: true, output: z.unknown() };
  ctx.registerCommand('kvcoder.retrycheck.seed', { ...common, input: z.object({}), handle: () => ctx.store.transaction(tx => {
    const r = txRecords(tx), stamp = new Date().toISOString(), usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const s = r.sessions.insert({ title: 'seed', autoTitle: false, status: 'running', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp });
    const t = r.turns.insert({ sessionId: s.id, startedAt: stamp, endedAt: null, durationMs: 0, steps: 0, lost: 0, usage, outcome: null, calls: [], pending: [], results: [] });
    r.sessions.update(s.id, { turnId: t.id }); return prepareStep(r, s.id, t.id);
  }) });
  ctx.registerCommand('kvcoder.retrycheck.replace', { ...common, input: identity, handle: input => ctx.store.transaction(tx => {
    const r = txRecords(tx); invalidateStep(r, input, 'TURN_ENDED'); return prepareStep(r, input.sessionId, input.turnId);
  }) });
  ctx.registerCommand('kvcoder.retrycheck.run', { ...common, input: stepInputSchema, retries: 0, handle: async input => {
    const lease = await claimStepInput(ctx, input); if (!lease) throw new Error('Lease missing');
    const local: Ctx = { ...ctx, exec: async () => {
      const attempts = ctx.store.collection('attempts', z.object({ sessionId: z.string() }));
      await attempts.insert({ sessionId: input.sessionId });
      const repeated = await attempts.count({ sessionId: input.sessionId }) > 1;
      throw new ProblemError({ code: repeated ? 'VALIDATION_FAILED' : 'kvai/RATE_LIMITED', message: repeated ? 'controlled permanent second response' : 'controlled transient first response' });
    } };
    return completeWithRetries(local, { sessionId: input.sessionId, systemPrompt: 'test', messages: [], thinking: 'off' }, lease);
  } });
  ctx.registerQuery('kvcoder.retrycheck.attempts', { ...common, input: z.object({ sessionId: z.string() }), handle: input => ctx.store.collection('attempts', z.object({ sessionId: z.string() })).count(input) });
};
`;

describe('model retries retain canonical step authority (ADR0041)', () => {
  it('rechecks after the existing backoff and issues no second request for a revoked generation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'retry-fence-'));
    let kernel: TestKernel | undefined;
    try {
      writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/retryfence', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'kvcoder', source: 'index.ts', dependencies: {} } }));
      writeFileSync(path.join(root, 'index.ts'), entry);
      kernel = await createTestKernel({ extensions: [root], settings: { 'kernel.workers': 2 } });
      const input = identitySchema.parse(await kernel.exec('kvcoder.retrycheck.seed', {}));
      let ready = (): void => undefined;
      const announced = new Promise<void>(resolve => { ready = resolve; });
      const jobId = await kernel.execAsync('kvcoder.retrycheck.run', input, { onProgress: chunk => {
        if (z.object({ type: z.literal('retry'), attempt: z.literal(2) }).safeParse(chunk.data).success) ready();
      } });
      await announced;
      const next = identitySchema.parse(await kernel.exec('kvcoder.retrycheck.replace', input));
      expect(next.generation).toBe(input.generation + 1);
      expect(next.intentId).not.toBe(input.intentId);
      const finished = await kernel.waitForJob(jobId);
      expect(finished).toMatchObject({ status: 'failed', problem: { code: 'VALIDATION_FAILED' } });
      expect(await kernel.exec('kvcoder.retrycheck.attempts', { sessionId: input.sessionId })).toBe(1);
    } finally {
      try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });
});

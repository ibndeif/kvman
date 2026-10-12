import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { startFakeOpenAI, type FakeOpenAI } from '@kvman/testkit/fake-openai';
import { messageDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../../src/schemas/records.ts';
import { kvcoderFolder } from './kvcoder-kernel.ts';
import { newSession } from './turns.ts';

const source = (name: string) => JSON.stringify(new URL(`../../src/${name}`, import.meta.url).href);
const stored = { id: z.string() };
export const recoveryStateSchema = z.object({
  session: sessionDocSchema.extend(stored), turns: z.array(turnDocSchema.extend(stored)),
  intents: z.array(stepIntentDocSchema.extend(stored)), messages: z.array(messageDocSchema.extend(stored)),
});
export const recoveryOwner = { as: '@kvman/kvcoder' };
const wrapper = `
import { z, type Ctx } from '@kvman/sdk';
import original from ${source('index.ts')};
import { sessionDocSchema } from ${source('schemas/records.ts')};
import { txRecords } from ${source('store/collections.ts')};
import { openTurn } from ${source('turns/start-turn.ts')};
import { claimStep } from ${source('turns/step-intents.ts')};
import { noUsage } from ${source('turns/history.ts')};
export default (ctx: Ctx): void => {
  original(ctx);
  ctx.registerCommand('kvcoder.recovery-fixture.seed', {
    description: 'Prepare isolated recovery states without enqueue.',
    input: z.object({ mode: z.enum(['prepared', 'claimed', 'legacy', 'waiting']), sessionId: z.string().optional(), padding: z.number().int().nonnegative().optional(), paddingActive: z.boolean().optional(), extraIntents: z.number().int().nonnegative().optional(), broken: z.enum(['dangling', 'foreign', 'phase', 'job', 'null-job', 'generation']).optional(), jobId: z.string().optional() }), output: z.json(),
    handle: input => ctx.store.transaction(tx => {
      const s = txRecords(tx), stamp = new Date().toISOString();
      const doc = { title: 'Recovery', autoTitle: false, status: 'idle', parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage: noUsage(), durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp };
      const old = tx.collection('sessions', sessionDocSchema.omit({ stepGeneration: true, stepIntentId: true }));
      for (let i = 0; i < (input.padding ?? 0); i++) {
        const padded = old.insert(doc);
        if (input.paddingActive) {
          const turn = s.turns.insert({ sessionId: padded.id, startedAt: stamp, endedAt: null, durationMs: 0, steps: 1, lost: 0, usage: noUsage(), outcome: null, calls: [], pending: [], results: [] });
          old.update(padded.id, { status: 'running', turnId: turn.id });
        }
      }
      const legacy = input.mode === 'legacy' || input.mode === 'waiting';
      const session = input.sessionId === undefined ? legacy ? s.sessions.get(old.insert(doc).id) : s.sessions.insert({ ...doc, stepGeneration: 0, stepIntentId: null }) : s.sessions.get(input.sessionId);
      if (session === undefined) throw new Error('Missing seed session');
      if (legacy) {
        const turn = s.turns.insert({ sessionId: session.id, startedAt: stamp, endedAt: null, durationMs: 0, steps: 1, lost: 0, usage: noUsage(), outcome: null, calls: [], pending: [], results: [] });
        old.update(session.id, { status: input.mode === 'waiting' ? 'waiting' : 'running', turnId: turn.id, stepJobId: input.mode === 'legacy' ? input.jobId ?? 'legacy-gone' : null });
        if (input.mode === 'waiting') {
          const q = s.questions.insert({ sessionId: session.id, rootSessionId: session.id, turnId: turn.id, toolCallId: 'waiting-call', kind: 'confirm', question: { prompt: 'Continue?' } });
          s.turns.update(turn.id, { calls: [{ toolCallId: 'waiting-call', toolName: 'run' }], pending: [{ toolCallId: 'waiting-call', kind: 'question', questionId: q.id, question: q.question, childSessionId: null, runId: null }] });
        }
        return { sessionId: session.id, turnId: turn.id };
      }
      const turnId = openTurn(s, session), fresh = s.sessions.get(session.id);
      if (fresh?.stepIntentId === null || fresh === undefined) throw new Error('Missing prepared identity');
      const identity = { sessionId: session.id, turnId, intentId: fresh.stepIntentId, generation: fresh.stepGeneration };
      if (input.mode === 'claimed') {
        claimStep(s, identity, 'modern-gone');
        s.turns.update(turnId, { steps: 1 });
      }
      for (let i = 0; i < (input.extraIntents ?? 0); i++) s.stepIntents.insert({ sessionId: session.id, turnId, generation: identity.generation + i + 1, phase: 'claimed', jobId: 'orphan-job-' + i, legacyJobId: null, reason: null, createdAt: stamp, updatedAt: stamp });
      let foreignIntentId: string | undefined;
      if (input.broken === 'dangling') s.sessions.update(session.id, { stepIntentId: 'dangling-intent' });
      if (input.broken === 'foreign') {
        const foreign = s.stepIntents.insert({ sessionId: 'foreign-session', turnId: 'foreign-turn', generation: 1, phase: 'claimed', jobId: 'foreign-job', legacyJobId: null, reason: null, createdAt: stamp, updatedAt: stamp });
        foreignIntentId = foreign.id;
        s.sessions.update(session.id, { stepIntentId: foreign.id });
      }
      if (input.broken === 'phase') s.stepIntents.update(identity.intentId, { phase: 'settled' });
      if (input.broken === 'job') s.sessions.update(session.id, { stepJobId: 'another-unknown' });
      if (input.broken === 'null-job') { s.stepIntents.update(identity.intentId, { jobId: null }); s.sessions.update(session.id, { stepJobId: null }); }
      if (input.broken === 'generation') s.sessions.update(session.id, { stepGeneration: identity.generation + 1 });
      return { ...identity, ...(foreignIntentId === undefined ? {} : { foreignIntentId }) };
    }),
  });
  ctx.registerQuery('kvcoder.recovery-fixture.counts', {
    description: 'Inspect complete isolated recovery counts without oversized snapshots.', input: z.object({ sessionId: z.string().optional() }), output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx), filter = sessionId === undefined ? {} : { sessionId };
      return { running: s.sessions.count({ status: 'running' }), reviews: s.stepIntents.count({ ...filter, phase: 'needs-review' }), active: s.stepIntents.count({ ...filter, phase: 'claimed' }) + s.stepIntents.count({ ...filter, phase: 'prepared' }), interrupted: s.turns.count({ ...filter, outcome: 'interrupted' }), notices: s.messages.count({ ...filter, kind: 'notice' }) };
    }),
  });
  ctx.registerQuery('kvcoder.recovery-fixture.intent', {
    description: 'Inspect an isolated foreign diagnostic record.', input: z.object({ intentId: z.string() }), output: z.json(),
    handle: ({ intentId }) => ctx.store.transaction(tx => txRecords(tx).stepIntents.get(intentId)),
  });
  ctx.registerQuery('kvcoder.recovery-fixture.snapshot', {
    description: 'Read original owner records transactionally.', input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction(tx => {
      const s = txRecords(tx);
      return { session: s.sessions.get(sessionId), turns: s.turns.find({ sessionId }, { limit: 1000 }), intents: s.stepIntents.find({ sessionId }, { limit: 1000 }), messages: s.messages.find({ sessionId }, { limit: 1000 }) };
    }),
  });
};`;

export async function withRecoveryWorld(run: (kernel: TestKernel, fake: FakeOpenAI, sessionId: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-recovery-'));
  const fake = await startFakeOpenAI();
  let kernel: TestKernel | undefined;
  try {
    const manifest = z.object({ name: z.string(), version: z.string(), peerDependencies: z.record(z.string(), z.string()), kvman: z.object({ namespace: z.string(), dependencies: z.record(z.string(), z.string()) }) })
      .parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
    writeFileSync(path.join(root, 'index.ts'), wrapper);
    cpSync(path.join(kvcoderFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    kernel = await createTestKernel({ extensions: [path.join(kvcoderFolder, '../kvai'), path.join(kvcoderFolder, '../kvwebui'), root], settings: { 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat', 'kvai.defaultModel': 'fake/m1' } });
    await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Fake', api: 'openai-completions', baseUrl: fake.baseUrl });
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
    await run(kernel, fake, await newSession(kernel));
  } finally {
    try { await kernel?.close(); } finally { await fake.close(); rmSync(root, { recursive: true, force: true }); }
  }
}

export async function recoverySnapshot(kernel: TestKernel, sessionId: string, workspaceId?: string) {
  return recoveryStateSchema.parse(await kernel.exec('kvcoder.recovery-fixture.snapshot', { sessionId }, { ...recoveryOwner, ...(workspaceId === undefined ? {} : { workspaceId }) }));
}
export type BrokenRecovery = 'dangling' | 'foreign' | 'phase' | 'job' | 'null-job' | 'generation';
export async function seedRecovery(kernel: TestKernel, mode: 'prepared' | 'claimed' | 'legacy' | 'waiting', options: { sessionId?: string; padding?: number; paddingActive?: boolean; extraIntents?: number; broken?: BrokenRecovery; jobId?: string } = {}, workspaceId?: string) {
  return z.object({ sessionId: z.string(), turnId: z.string(), intentId: z.string().optional(), generation: z.number().optional(), foreignIntentId: z.string().optional() })
    .parse(await kernel.exec('kvcoder.recovery-fixture.seed', { mode, ...options }, { ...recoveryOwner, ...(workspaceId === undefined ? {} : { workspaceId }) }));
}

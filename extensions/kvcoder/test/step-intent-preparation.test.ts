import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jobSchema, z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { messageDocSchema, queuedDocSchema, sessionDocSchema, stepIntentDocSchema, turnDocSchema } from '../src/schemas/records.ts';
import type {} from '../src/index.ts';

const extensionsFolder = fileURLToPath(new URL('../..', import.meta.url));
const productFolder = path.join(extensionsFolder, 'kvcoder');
const sourceUrl = (relative: string) => new URL(`../src/${relative}`, import.meta.url).href;
const storedId = { id: z.string().min(1) };
const stateSchema = z.object({
  session: sessionDocSchema.extend(storedId),
  turns: z.array(turnDocSchema.extend(storedId)),
  intents: z.array(stepIntentDocSchema.extend(storedId)),
  messages: z.array(messageDocSchema.extend(storedId)),
  queued: z.array(queuedDocSchema.extend(storedId)),
});
const openedSchema = z.object({ turnId: z.string(), inside: stateSchema });
const inputSource = "z.object({ sessionId: z.string() })";
const fixtureCaller = { as: '@kvman/kvcoder' };

// A real extension with the original owner/namespace: no copied implementation and no production hooks.
// The probe never calls beginTurn/queueStep: its snapshot is taken before any enqueue can be requested.
const entry = `
import { z, type Ctx } from '@kvman/sdk';
import original from ${JSON.stringify(sourceUrl('index.ts'))};
import { openTurn } from ${JSON.stringify(sourceUrl('turns/start-turn.ts'))};
import { records, txRecords, type TxRecords } from ${JSON.stringify(sourceUrl('store/collections.ts'))};

function insideState(store: TxRecords, sessionId: string) {
  const session = store.sessions.get(sessionId);
  if (session === undefined) throw new Error('Fixture session missing');
  return {
    session,
    turns: store.turns.find({ sessionId }, { limit: 1000 }),
    intents: store.stepIntents.find({ sessionId }, { limit: 1000 }),
    messages: store.messages.find({ sessionId }, { limit: 1000 }),
    queued: store.queued.find({ sessionId }, { limit: 1000 }),
  };
}

export default (ctx: Ctx): void => {
  original(ctx);
  ctx.registerCommand('kvcoder.preparation-fixture.seed', {
    description: 'Sets a prior generation in the test fixture.',
    input: z.object({ sessionId: z.string(), generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
    output: z.object({}),
    handle: async ({ sessionId, generation }) => {
      await records(ctx.store).sessions.update(sessionId, { stepGeneration: generation });
      return {};
    },
  });
  ctx.registerQuery('kvcoder.preparation-fixture.state', {
    description: 'Reads the original owner records without mutating them.',
    input: ${inputSource}, output: z.json(),
    handle: async ({ sessionId }) => {
      const store = records(ctx.store);
      const session = await store.sessions.get(sessionId);
      if (session === undefined) throw new Error('Fixture session missing');
      return {
        session,
        turns: await store.turns.find({ sessionId }, { limit: 1000 }),
        intents: await store.stepIntents.find({ sessionId }, { limit: 1000 }),
        messages: await store.messages.find({ sessionId }, { limit: 1000 }),
        queued: await store.queued.find({ sessionId }, { limit: 1000 }),
      };
    },
  });
  ctx.registerCommand('kvcoder.preparation-fixture.open', {
    description: 'Calls original openTurn and observes its changes in the same transaction.',
    input: ${inputSource}, output: z.json(),
    handle: ({ sessionId }) => ctx.store.transaction((transaction) => {
      const store = txRecords(transaction);
      const session = store.sessions.get(sessionId);
      if (session === undefined) throw new Error('Fixture session missing');
      const turnId = openTurn(store, session);
      return { turnId, inside: insideState(store, sessionId) };
    }),
  });
  ctx.registerCommand('kvcoder.preparation-fixture.rollback', {
    description: 'Throws only in the test fixture after original openTurn returns inside the transaction.',
    input: ${inputSource}, output: z.json(),
    handle: async ({ sessionId }) => {
      let inside: ReturnType<typeof insideState> | null = null;
      let failure: string | null = null;
      try {
        await ctx.store.transaction((transaction) => {
          const store = txRecords(transaction);
          const session = store.sessions.get(sessionId);
          if (session === undefined) throw new Error('Fixture session missing');
          openTurn(store, session);
          inside = insideState(store, sessionId);
          throw new Error('fixture failure after openTurn');
        });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      return { inside, failure };
    },
  });
};
`;

async function withSession(run: (kernel: TestKernel, sessionId: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-preparation-'));
  let kernel: TestKernel | undefined;
  try {
    const manifest = z.object({
      name: z.literal('@kvman/kvcoder'), version: z.string(),
      peerDependencies: z.record(z.string(), z.string()),
      kvman: z.object({ namespace: z.literal('kvcoder'), dependencies: z.record(z.string(), z.string()) }),
    }).parse(JSON.parse(readFileSync(path.join(productFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      ...manifest, type: 'module', main: 'index.js',
      kvman: { ...manifest.kvman, source: 'index.ts' },
    }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    cpSync(path.join(productFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    kernel = await createTestKernel({
      extensions: [path.join(extensionsFolder, 'kvai'), path.join(extensionsFolder, 'kvwebui'), root],
      settings: { 'kvwebui.home': 'kvcoder.chat' },
    });
    const session = z.object({ id: z.string() }).parse(await kernel.exec('kvcoder.session.create', { title: 'Test' }));
    await run(kernel, session.id);
  } finally {
    try {
      await kernel?.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

async function state(kernel: TestKernel, sessionId: string) {
  return stateSchema.parse(await kernel.exec('kvcoder.preparation-fixture.state', { sessionId }, fixtureCaller));
}

async function stepJobs(kernel: TestKernel) {
  return z.array(jobSchema).parse(await kernel.exec('kernel.jobs.list', { limit: 1000 }))
    .filter((job) => job.name === 'kvcoder.turn.step');
}

async function seed(kernel: TestKernel, sessionId: string, generation: number): Promise<void> {
  await kernel.exec('kvcoder.preparation-fixture.seed', { sessionId, generation }, fixtureCaller);
}

describe('original openTurn durable preparation (E75, E85)', () => {
  it.each([
    { previous: 0, next: 1 },
    { previous: 9, next: 10 },
    { previous: Number.MAX_SAFE_INTEGER - 1, next: Number.MAX_SAFE_INTEGER },
  ])('E75 prepares generation $next atomically from $previous before enqueue', async ({ previous, next }) => {
    await withSession(async (kernel, sessionId) => {
      if (previous !== 0) await seed(kernel, sessionId, previous);
      const before = await state(kernel, sessionId);
      expect(before.session).toMatchObject({ status: 'idle', stepGeneration: previous, stepIntentId: null, turnId: null, stepJobId: null });
      expect(before.turns).toEqual([]);
      expect(before.intents).toEqual([]);
      const jobsBefore = await stepJobs(kernel);
      const opened = openedSchema.parse(await kernel.exec('kvcoder.preparation-fixture.open', { sessionId }, fixtureCaller));
      const committed = await state(kernel, sessionId);
      expect(committed).toEqual(opened.inside);
      expect(await stepJobs(kernel)).toEqual(jobsBefore);
      // The first baseline failure must be missing intent state, not an absent import or fixture API.
      expect(opened.inside.intents).toHaveLength(1);
      const intent = opened.inside.intents[0];
      if (intent === undefined) throw new Error('Prepared intent missing');
      expect(opened.inside.session).toMatchObject({
        id: sessionId, status: 'running', turnId: opened.turnId,
        stepGeneration: next, stepIntentId: intent.id, stepJobId: null,
      });
      expect(intent).toMatchObject({
        sessionId, turnId: opened.turnId, generation: next, phase: 'prepared',
        jobId: null, legacyJobId: null, reason: null,
      });
      expect(Number.isSafeInteger(intent.generation)).toBe(true);
      expect(intent.createdAt).toBe(intent.updatedAt);
      expect(opened.inside.turns).toHaveLength(1);
      expect(opened.inside.turns[0]).toMatchObject({ id: opened.turnId, sessionId, steps: 0, endedAt: null, outcome: null });
      expect(committed.messages).toEqual(before.messages);
      expect(committed.queued).toEqual(before.queued);
    });
  });

  it('E85 rejects MAX_SAFE_INTEGER + 1 and leaves identical prior records before effects', async () => {
    await withSession(async (kernel, sessionId) => {
      await seed(kernel, sessionId, Number.MAX_SAFE_INTEGER);
      const before = await state(kernel, sessionId);
      const jobsBefore = await stepJobs(kernel);
      let rejection: unknown;
      try {
        await kernel.exec('kvcoder.preparation-fixture.open', { sessionId }, fixtureCaller);
      } catch (error) {
        rejection = error;
      }
      expect.soft(rejection, 'openTurn must reject generation overflow').toBeDefined();
      expect.soft(await state(kernel, sessionId), 'overflow must roll back all owner records').toEqual(before);
      expect(await stepJobs(kernel)).toEqual(jobsBefore);
    });
  });

  it('E75 rolls back all staged records when the fixture throws after openTurn within the transaction', async () => {
    await withSession(async (kernel, sessionId) => {
      await seed(kernel, sessionId, 9);
      const before = await state(kernel, sessionId);
      const jobsBefore = await stepJobs(kernel);
      const result = z.object({ inside: stateSchema, failure: z.literal('fixture failure after openTurn') })
        .parse(await kernel.exec('kvcoder.preparation-fixture.rollback', { sessionId }, fixtureCaller));
      expect(result.inside.session).toMatchObject({ status: 'running', stepJobId: null });
      expect(result.inside.turns).toHaveLength(1);
      expect(result.inside.session.turnId).toBe(result.inside.turns[0]?.id);
      expect(await state(kernel, sessionId)).toEqual(before);
      expect(await stepJobs(kernel)).toEqual(jobsBefore);
    });
  });
});

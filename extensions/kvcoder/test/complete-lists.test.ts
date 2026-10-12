import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import { kvcoderFolder } from './support/kvcoder-kernel.ts';

// The product's own job list, export, and retention over more records than one page holds, seeded straight into its store.
const source = (file: string) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href);
const owner = { as: '@kvman/kvcoder' };
const wrapper = `
import { z, type Ctx } from '@kvman/sdk';
import original from ${source('index.ts')};
import { txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, turnDocSchema, runDocSchema } from ${source('schemas/records.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
export default (ctx: Ctx): void => {
  original(ctx);
  ctx.registerCommand('kvcoder.seed-fixture.fill', {
    description: 'Seeds schema-valid records of one chat.',
    input: z.object({ sessions: z.number().int(), waiting: z.boolean(), turns: z.number().int(), children: z.number().int(), runs: z.number().int() }), output: z.object({ sessionId: z.string(), waitingId: z.string().nullable() }),
    handle: input => ctx.store.transaction(tx => {
      const store = txRecords(tx);
      const session = (parentId: string | null, status: 'idle' | 'waiting' = 'idle') => store.sessions.insert(sessionDocSchema.parse({ title: 'Seeded', autoTitle: false, deleting: false, status, parentId, worker: null,
        model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [], createdAt: at(0), updatedAt: at(0) }));
      const waiting = input.waiting ? session(null, 'waiting') : undefined;
      const chat = session(null);
      for (let index = 0; index < input.sessions; index += 1) session(null);
      for (let index = 0; index < input.children; index += 1) session(chat.id);
      for (let index = 0; index < input.turns; index += 1) store.turns.insert(turnDocSchema.parse({ sessionId: chat.id, startedAt: at(index), endedAt: at(index), durationMs: 0, steps: 1, lost: 0, usage, outcome: 'done', calls: [], pending: [], results: [] }));
      for (let index = 0; index < input.runs; index += 1) store.runs.insert(runDocSchema.parse({ sessionId: chat.id, toolCallId: null, worker: 'helper', kind: 'pi', call: 'Run ' + String(index), command: 'pi', args: [], timeoutMs: 60000,
        jobId: null, status: index === 0 ? 'running' : 'succeeded', startedAt: at(index), endedAt: index === 0 ? null : at(index), exitCode: index === 0 ? null : 0, output: index === 0 ? null : 'done' }));
      return { sessionId: chat.id, waitingId: waiting?.id ?? null };
    }),
  });
  ctx.registerQuery('kvcoder.seed-fixture.sessions', {
    description: 'Counts the top-level sessions.', input: z.object({}), output: z.object({ count: z.number(), statuses: z.array(z.string()) }),
    handle: () => ctx.store.transaction(tx => {
      const all = [];
      for (let page = txRecords(tx).sessions.find({ parentId: null }, { limit: 1000 }); page.length > 0; page = txRecords(tx).sessions.find({ parentId: null }, { limit: 1000, after: all.at(-1)?.id ?? '' })) all.push(...page);
      return { count: all.length, statuses: [...new Set(all.map(found => found.status))].sort() };
    }),
  });
};`;

type Seed = { sessions?: number; waiting?: boolean; turns?: number; children?: number; runs?: number };
async function seeded(seed: Seed, settings: Record<string, Json>, check: (kernel: TestKernel, ids: { sessionId: string; waitingId: string | null }) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-complete-'));
  let kernel: TestKernel | undefined;
  try {
    const manifest = z.object({ name: z.string(), version: z.string(), peerDependencies: z.record(z.string(), z.string()), kvman: z.object({ namespace: z.string(), dependencies: z.record(z.string(), z.string()) }) }).parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
    writeFileSync(path.join(root, 'index.ts'), wrapper);
    cpSync(path.join(kvcoderFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    kernel = await createTestKernel({ extensions: [path.join(kvcoderFolder, '../kvai'), path.join(kvcoderFolder, '../kvwebui'), root], settings: { 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat', ...settings } });
    await check(kernel, z.object({ sessionId: z.string(), waitingId: z.string().nullable() }).parse(await kernel.exec('kvcoder.seed-fixture.fill', { sessions: 0, waiting: false, turns: 0, children: 0, runs: 0, ...seed }, owner)));
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

describe('lists, export, and retention read every record (KVC-31, ADR 0057)', { timeout: 120_000 }, () => {
  it('M2.4-E178 an old job that still runs stays in the list, first, with the newest ended ones', async () => {
    await seeded({ runs: 61 }, {}, async (kernel, { sessionId }) => {
      const rows = await kernel.exec('kvcoder.job.list', { sessionId });
      expect(rows).toHaveLength(50);
      expect(rows[0]).toMatchObject({ call: 'Run 0', status: 'running' });
      expect(rows.slice(1).map((row) => row.call)).toEqual(Array.from({ length: 49 }, (_, index) => `Run ${String(60 - index)}`));
    });
  });

  it('M2.4-E179 an export holds every turn and every subagent session', async () => {
    await seeded({ turns: 1001, children: 1001 }, {}, async (kernel, { sessionId }) => {
      const { fileId } = await kernel.exec('kvcoder.session.export', { sessionId });
      const file = await kernel.exec('kernel.files.get', { id: fileId });
      const data = z.object({ turns: z.array(z.unknown()), subagents: z.array(z.unknown()) }).parse(JSON.parse(readFileSync(path.join(kernel.home, 'files', file.id), 'utf8')));
      expect([data.turns.length, data.subagents.length]).toEqual([1001, 1001]);
    });
  });

  it.each([[5, 6, ['idle', 'waiting']], [0, 1007, ['idle', 'waiting']]] as const)('M2.4-E180 retention with keep %i leaves %i sessions in one run', async (keep, left, statuses) => {
    await seeded({ sessions: 1005, waiting: true }, { 'kvcoder.sessions.keep': keep }, async (kernel) => {
      await kernel.exec('kvcoder.session.prune', {}, owner);
      expect(await kernel.exec('kvcoder.seed-fixture.sessions', {}, owner)).toEqual({ count: left, statuses });
    });
  });
});

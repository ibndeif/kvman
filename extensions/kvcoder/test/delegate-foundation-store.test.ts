import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';
import type {} from '../src/index.ts';

const extensionsFolder = fileURLToPath(new URL('../..', import.meta.url));
const productFolder = path.join(extensionsFolder, 'kvcoder');
const sourceUrl = (relative: string) => new URL(`../src/${relative}`, import.meta.url).href;
const owner = { as: '@kvman/kvcoder' };
const jsonObject = z.record(z.string(), z.json());
const entry = `
import { z, type Ctx } from '@kvman/sdk';
import original from ${JSON.stringify(sourceUrl('index.ts'))};
import { records, txRecords } from ${JSON.stringify(sourceUrl('store/collections.ts'))};
import { openTurn } from ${JSON.stringify(sourceUrl('turns/start-turn.ts'))};
import { createChild } from ${JSON.stringify(sourceUrl('connectors/delegate.ts'))};

const raw = z.record(z.string(), z.json());

export default (ctx: Ctx): void => {
  original(ctx);
  ctx.registerCommand('kvcoder.foundation-fixture.creation', {
    description: 'Calls original child and turn creation, then writes physically absent legacy fields.',
    input: z.object({ sessionId: z.string() }), output: z.json(),
    handle: async ({ sessionId }) => {
      const store = records(ctx.store);
      const parent = await store.sessions.get(sessionId);
      if (parent === undefined) throw new Error('Parent missing');
      const childId = await createChild(ctx, parent, { name: 'helper', kind: 'subagent', description: 'Helper', enabled: true, readOnly: false, instructions: 'Help', connectors: [], model: null, thinking: null }, { title: 'Child', task: 'Test', brief: { kind: 'find', goal: 'Test', files: null, budget: 60 } }, current => {
        const session = current.sessions.get(sessionId);
        if (session === undefined) throw new Error('Parent missing');
        return session;
      });
      const turnId = await ctx.store.transaction(tx => openTurn(txRecords(tx), parent));
      const rawSessions = ctx.store.collection('sessions', raw);
      const rawTurns = ctx.store.collection('turns', raw);
      const newSession = await rawSessions.get(sessionId);
      const newChild = await rawSessions.get(childId);
      const newTurn = await rawTurns.get(turnId);
      if (!newSession || !newTurn) throw new Error('Creation missing');
      const omit = (value: Record<string, z.JSONType>, key: string) => Object.fromEntries(Object.entries(value).filter(([field]) => field !== key && field !== 'id'));
      const oldSession = await rawSessions.insert(omit(newSession, 'deleting'));
      const oldTurn = await rawTurns.insert(omit(newTurn, 'deferredCalls'));
      const legacyRaw = { session: await rawSessions.get(oldSession.id), turn: await rawTurns.get(oldTurn.id) };
      const legacy = { session: await store.sessions.get(oldSession.id), turn: await store.turns.get(oldTurn.id) };
      const legacyRawAfter = { session: await rawSessions.get(oldSession.id), turn: await rawTurns.get(oldTurn.id) };
      return { newSession, newChild, newTurn, legacyRaw, legacy, legacyRawAfter };
    },
  });
};
`;

async function withKernel(run: (kernel: TestKernel) => Promise<void>): Promise<void> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-foundation-'));
  let kernel: TestKernel | undefined;
  try {
    const manifest = z.object({
      name: z.literal('@kvman/kvcoder'), version: z.string(), peerDependencies: z.record(z.string(), z.string()),
      kvman: z.object({ namespace: z.literal('kvcoder'), dependencies: z.record(z.string(), z.string()) }),
    }).parse(JSON.parse(readFileSync(path.join(productFolder, 'package.json'), 'utf8')));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ ...manifest, type: 'module', main: 'index.js', kvman: { ...manifest.kvman, source: 'index.ts' } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    cpSync(path.join(productFolder, 'locales'), path.join(root, 'locales'), { recursive: true });
    kernel = await createTestKernel({ extensions: [path.join(extensionsFolder, 'kvai'), path.join(extensionsFolder, 'kvwebui'), root], settings: { 'kvwebui.home': 'kvcoder.chat' } });
    await run(kernel);
  } finally {
    try { await kernel?.close(); } finally { rmSync(root, { recursive: true, force: true }); }
  }
}
describe('E120 native SQLite internal foundation', () => {
  it('persists explicit new creation values and defaults legacy reads without rewriting absent fields', async () => {
    await withKernel(async kernel => {
      const session = await kernel.exec('kvcoder.session.create', { title: 'Test' });
      const result = z.object({ newSession: jsonObject, newChild: jsonObject, newTurn: jsonObject,
        legacyRaw: z.object({ session: jsonObject, turn: jsonObject }),
        legacy: z.object({ session: jsonObject, turn: jsonObject }),
        legacyRawAfter: z.object({ session: jsonObject, turn: jsonObject }),
      }).parse(await kernel.exec('kvcoder.foundation-fixture.creation', { sessionId: session.id }, owner));
      expect.soft(result.newSession).toHaveProperty('deleting', false);
      expect.soft(result.newChild).toHaveProperty('deleting', false);
      expect.soft(result.newTurn).toHaveProperty('deferredCalls', []);
      expect(result.legacyRaw.session).not.toHaveProperty('deleting');
      expect(result.legacyRaw.turn).not.toHaveProperty('deferredCalls');
      expect.soft(result.legacy.session).toHaveProperty('deleting', false);
      expect.soft(result.legacy.turn).toHaveProperty('deferredCalls', []);
      expect(result.legacyRawAfter).toEqual(result.legacyRaw);
    });
  });
});

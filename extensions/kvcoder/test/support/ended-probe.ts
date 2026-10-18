import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '@kvman/testkit';

// A probe extension that ends a seeded turn with `endTurnState` and gives back the chat's tool results (ADR 0087, 1).
// The turn's last reply makes seven calls: one already has a stored result, one ran and is held, one was approved and
// not run, one was held back, one waits on a question, one on a helper, and one was running when the turn ended.

const source = (file: string): string => JSON.stringify(new URL(`../../src/${file}`, import.meta.url).href);

const entry = `
import { z, type Ctx } from '@kvman/sdk';
import { txRecords } from ${source('store/collections.ts')};
import { sessionDocSchema, turnDocSchema, outcomeSchema } from ${source('schemas/records.ts')};
import { appendMessage } from ${source('turns/history.ts')};
import { endTurnState } from ${source('turns/end-turn-state.ts')};
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
const ids = ['stored', 'held', 'approved', 'deferred', 'question', 'helper', 'running'];
const write = { description: 'Writing a file', connector: 'fs', command: 'write', payload: { path: 'a.txt', content: 'a', risky: true } };
const pending = (toolCallId, kind) => ({ toolCallId, kind, questionId: null, question: null, childSessionId: null, runId: null });
export default (ctx: Ctx): void => {
  ctx.registerCommand('endedprobe.run', {
    public: true, description: 'Ends a seeded turn and lists its tool results.',
    input: z.object({ outcome: outcomeSchema }), output: z.json(),
    handle: async ({ outcome }) => ctx.store.transaction(tx => {
      const store = txRecords(tx), stamp = new Date().toISOString();
      const session = store.sessions.insert(sessionDocSchema.parse({ title: 'Ended', autoTitle: false, status: 'waiting',
        parentId: null, worker: null, model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null,
        turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, optedIn: [],
        createdAt: stamp, updatedAt: stamp }));
      const turn = store.turns.insert(turnDocSchema.parse({ sessionId: session.id, startedAt: stamp, endedAt: null,
        durationMs: 0, steps: 1, lost: 0, usage, outcome: null, calls: ids.map(id => ({ toolCallId: id, toolName: 'run' })),
        pending: [pending('question', 'question'), pending('helper', 'subagent')],
        results: [{ toolCallId: 'held', text: 'ran before the end', details: null, isError: false, run: null },
          { toolCallId: 'approved', text: '', details: null, isError: false, run: write }],
        deferredCalls: [{ toolCallId: 'deferred', call: write }] }));
      store.sessions.update(session.id, { turnId: turn.id });
      appendMessage(store, session, { kind: 'assistant', turnId: turn.id, content: { role: 'assistant',
        content: ids.map(id => ({ type: 'toolCall', id, name: 'run', arguments: {} })) } });
      appendMessage(store, session, { kind: 'toolResult', turnId: turn.id, content: { role: 'toolResult', toolCallId: 'stored',
        toolName: 'run', content: [{ type: 'text', text: 'already here' }], isError: false } });
      const by = outcome === 'cancelled' ? 'cancel' : 'handler';
      if (endTurnState(store, session.id, turn.id, outcome, by) === undefined) throw new Error('The turn did not end.');
      return store.messages.find({ sessionId: session.id, kind: 'toolResult' }, { limit: 100 })
        .sort((first, second) => first.seq - second.seq)
        .map(message => ({ id: message.content.toolCallId, text: message.content.content[0].text, isError: message.content.isError }));
    }),
  });
};
`;

const resultsSchema = z.array(z.object({ id: z.string(), text: z.string(), isError: z.boolean() }));

/** Ends the seeded turn with `outcome` and gives back every tool result of the chat, oldest first. */
export async function endedProbe(outcome: 'cancelled' | 'failed' | 'interrupted' | 'maxSteps'): Promise<z.output<typeof resultsSchema>> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-ended-probe-'));
  let kernel: TestKernel | undefined;
  try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@test/endedprobe', version: '0.1.0', type: 'module', main: 'index.js', peerDependencies: { '@kvman/sdk': '^0.1.0' }, kvman: { namespace: 'endedprobe', source: 'index.ts', dependencies: {} } }));
    writeFileSync(path.join(root, 'index.ts'), entry);
    kernel = await createTestKernel({ extensions: [root] });
    return resultsSchema.parse(await kernel.exec('endedprobe.run', { outcome }));
  } finally {
    try {
      await kernel?.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

import { describe, expect, it } from 'vitest';
import { backgroundDocSchema, heldResultSchema, messageDocSchema, sessionDocSchema } from '../../src/schemas/records.ts';
import { runApproved } from '../../src/turns/run-calls.ts';
import { connectorDocSchema } from '../../src/schemas/registry.ts';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';

describe('records stored before the run tool (08 §8.3, ADR 0011, 12)', () => {
  it('QA18-E20 an approved call of the old shell tool parses and is never run', async () => {
    const held = heldResultSchema.parse({ toolCallId: 'c1', text: '', details: null, isError: false, run: { title: 'Install', command: 'npm install', mode: 'sync', timeoutMs: 120_000 } });
    const neverUsed = new Proxy({}, { get: (_target, key) => { throw new Error(`An old call reached ${String(key)}.`); } });
    expect(await runApproved(neverUsed as never, neverUsed as never, held)).toEqual({ toolCallId: 'c1', text: 'denied by the user\nMake this call again with the run tool.', details: null, isError: true, run: null });
  });

  it('QA18-E23 a background row of the removed kind still parses', () => {
    const row = { sessionId: 's1', ref: 'job-1', kind: 'connector', call: 'todo wait --async', startedAt: '2026-10-01T00:00:00.000Z' };
    expect(backgroundDocSchema.parse(row)).toEqual(row);
  });

  it('QA39-E19, QA60-E4, and QA63-E4 a session stored before optIn connectors reads as none enabled, not deciding, and with no allowed hosts', () => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const stored = { title: 'Old', autoTitle: false, status: 'idle', parentId: null, worker: null, model: 'fake/m1', thinking: 'off', stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
    // QA60-E4: and before Decide for me, as off.
    expect(sessionDocSchema.parse(stored)).toEqual({ ...stored, optedIn: [], stepGeneration: 0, stepIntentId: null, deleting: false, decides: false, clearedThroughSeq: null, collapsedThroughSeq: null, run: null, webHosts: [], usageBy: { summary: usage, title: usage, helpers: usage } });
  });

  it('QA71-E16 a session with no collapsed turns or kept rules, and a reply with no sent record, read as before', () => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const session = sessionDocSchema.parse({ title: 'Old', autoTitle: false, status: 'idle', parentId: null, worker: null, model: 'fake/m1', thinking: 'off', stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });
    expect(session.collapsedThroughSeq).toBeNull();
    expect('rules' in session).toBe(false);
    const reply = messageDocSchema.parse({ sessionId: 's1', turnId: 't1', seq: 3, block: 0, kind: 'assistant', source: null, content: { role: 'assistant', content: [] }, fileIds: null, fileNames: null, model: 'fake/m1', usage, durationMs: 10, createdAt: '2026-10-01T00:00:00.000Z' });
    expect(reply.sent).toBeNull();
    expect(reply.basis).toBeNull();
  });

  it('QA71-E39 a connector command stored before ADR 0108 reads with no signature, and its index line names it only', () => {
    const old = connectorDocSchema.parse({ owner: '@test/todo', name: 'todo', description: 'Todos.', kind: 'commands', commands: [{ name: 'list', command: 'todo.item.list', examples: [] }], binary: null });
    expect(old.commands?.[0]?.signature).toBeNull();
    const prompt = buildPrompt({ role: 'lead', workspacePath: '/w', platform: 'linux', shell: 'bash', language: 'en', sections: [], connectors: [{ name: 'todo', description: 'Todos.', commands: ['list'], signatures: [undefined] }] });
    expect(prompt.prompt).toContain('- todo: Todos.\n  list\n  help { command? }');
  });
});

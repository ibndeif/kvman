import { describe, expect, it } from 'vitest';
import { backgroundDocSchema, heldResultSchema, sessionDocSchema } from '../../src/schemas/records.ts';
import { runApproved } from '../../src/turns/run-calls.ts';

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

  it('QA39-E19 a session stored before optIn connectors reads as none enabled', () => {
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    const stored = { title: 'Old', autoTitle: false, status: 'idle', parentId: null, worker: null, model: 'fake/m1', thinking: 'off', stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0, usage, durationMs: 0, checks: null, connectors: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
    expect(sessionDocSchema.parse(stored)).toEqual({ ...stored, optedIn: [] });
  });
});

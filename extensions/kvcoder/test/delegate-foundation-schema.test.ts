import { describe, expect, it } from 'vitest';
import * as schemas from '../src/schemas/records.ts';
import { noUsage } from '../src/turns/history.ts';
import { sessionView, turnView } from '../src/sessions/session-view.ts';

const stamp = '2026-10-11T12:00:00.000Z';
const session = {
  title: 'Test', autoTitle: false, status: 'idle', parentId: null, worker: null,
  model: null, thinking: 'off', stepJobId: null, stepGeneration: 0, stepIntentId: null,
  turnId: null, endedTurns: 0, nextSeq: 0, usage: noUsage(), durationMs: 0,
  checks: null, connectors: null, optedIn: [], createdAt: stamp, updatedAt: stamp,
};
const turn = {
  sessionId: 'session', startedAt: stamp, endedAt: null, durationMs: 0,
  steps: 0, lost: 0, usage: noUsage(), outcome: null, calls: [], pending: [], results: [],
};
const process = {
  workspaceId: 'workspace', sessionId: 'session', title: 'Test', call: 'echo test',
  startedAt: stamp, reported: false,
};

describe('E120 internal lifecycle fields', () => {
  it('has no permit records and no process cleanup field (ADR 0052)', () => {
    expect(Reflect.has(schemas, 'delegateStartDocSchema')).toBe(false);
    expect(schemas.processDocSchema.parse(process)).not.toHaveProperty('cleanup');
  });

  it('defaults physically absent legacy fields without changing public projections or held.run', () => {
    const parsedSession = schemas.sessionDocSchema.parse(session);
    const parsedTurn = schemas.turnDocSchema.parse(turn);
    expect.soft(parsedSession).toHaveProperty('deleting', false);
    expect.soft(parsedTurn).toHaveProperty('deferredCalls', []);
    expect(sessionView({ ...parsedSession, id: 'session' })).toEqual({
      id: 'session', title: 'Test', status: 'idle', model: null, thinking: 'off', decides: false,
      usage: noUsage(), durationMs: 0, waitingOn: null, createdAt: stamp, updatedAt: stamp,
    });
    expect(turnView({ ...parsedTurn, id: 'turn' })).toEqual({
      id: 'turn', sessionId: 'session', startedAt: stamp, durationMs: 0, steps: 0, usage: noUsage(), pending: [],
    });
    expect(schemas.statusSchema.options).toEqual(['idle', 'running', 'waiting']);
    const held = { toolCallId: 'call', text: '', details: null, isError: false, run: null };
    for (const run of [null, { command: 'echo test', timeoutMs: 100 }, { description: 'Read', connector: 'fs', command: 'read', payload: { path: 'a' } }]) {
      expect(schemas.heldResultSchema.parse({ ...held, run })).toEqual({ ...held, run });
    }
  });

  it('stores deferred calls using the existing strict RunCallDoc shape', () => {
    const call = { description: 'Read', connector: 'fs', command: 'read', payload: { path: 'a' } };
    expect.soft(schemas.turnDocSchema.parse({ ...turn, deferredCalls: [{ toolCallId: 'call', call }] }))
      .toHaveProperty('deferredCalls', [{ toolCallId: 'call', call }]);
    for (const deferredCalls of [null, [{}], [{ toolCallId: 'call' }], [{ toolCallId: 1, call }], [{ toolCallId: 'call', call: { ...call, extra: true } }]]) {
      expect.soft(schemas.turnDocSchema.safeParse({ ...turn, deferredCalls }).success).toBe(false);
    }
    expect.soft(schemas.sessionDocSchema.safeParse({ ...session, deleting: null }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { sessionDocSchema, stepIntentDocSchema } from '../../src/schemas/records.ts';
import { sessionView } from '../../src/sessions/session-view.ts';

const stamp = '2026-10-01T00:00:00.000Z';
const legacy = {
  title: 'Old', autoTitle: false, status: 'idle', parentId: null, worker: null, model: 'fake/m1', thinking: 'off',
  stepJobId: null, turnId: null, endedTurns: 0, nextSeq: 0,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
  durationMs: 0, checks: null, connectors: null, createdAt: stamp, updatedAt: stamp,
};

const intent = {
  sessionId: 'session-1', turnId: 'turn-1', generation: 1, phase: 'prepared',
  jobId: null, legacyJobId: null, reason: null, createdAt: stamp, updatedAt: stamp,
};

describe('step intent records (ADR0041)', () => {
  it('M2.4-E88 legacy reads have explicit neutral defaults without mutating the source object', () => {
    expect(sessionDocSchema.parse(legacy)).toMatchObject({ stepGeneration: 0, stepIntentId: null });
    expect(legacy).not.toHaveProperty('stepGeneration');
    expect(legacy).not.toHaveProperty('stepIntentId');
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, '1'])('M2.4-E88 invalid generation %s is rejected', (stepGeneration) => {
    expect(sessionDocSchema.safeParse({ ...legacy, stepGeneration, stepIntentId: null }).success).toBe(false);
  });

  it.each(['prepared', 'claimed', 'settled', 'invalidated', 'needs-review'])('M2.4-E88 intent phase %s has explicit nullable tracking', (phase) => {
    const record = { ...intent, phase };
    expect(stepIntentDocSchema.parse(record)).toEqual(record);
  });

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, null, '1'])('M2.4-E88 invalid intent generation %s is rejected', (generation) => {
    expect(stepIntentDocSchema.safeParse({ ...intent, generation }).success).toBe(false);
  });

  it.each(['jobId', 'legacyJobId', 'reason', 'createdAt', 'updatedAt'])('M2.4-E88 new intent requires explicit %s', (field) => {
    const missing = { ...intent };
    Reflect.deleteProperty(missing, field);
    expect(stepIntentDocSchema.safeParse(missing).success).toBe(false);
  });

  it('M2.4-E88 unknown phases and invalid ISO times are rejected', () => {
    expect(stepIntentDocSchema.safeParse({ ...intent, phase: 'running' }).success).toBe(false);
    expect(stepIntentDocSchema.safeParse({ ...intent, createdAt: 'yesterday' }).success).toBe(false);
    expect(stepIntentDocSchema.safeParse({ ...intent, updatedAt: 'tomorrow' }).success).toBe(false);
    expect(stepIntentDocSchema.parse({ ...intent, generation: Number.MAX_SAFE_INTEGER }).generation).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, Number.MAX_SAFE_INTEGER])('M2.4-E88 safe generation %s remains private', (stepGeneration) => {
    const session = sessionDocSchema.parse({ ...legacy, stepGeneration, stepIntentId: 'intent-1' });
    expect(session).toMatchObject({ stepGeneration, stepIntentId: 'intent-1' });
    const shown = sessionView({ ...session, id: 'session-1' });
    expect(shown).not.toHaveProperty('stepGeneration');
    expect(shown).not.toHaveProperty('stepIntentId');
  });
});

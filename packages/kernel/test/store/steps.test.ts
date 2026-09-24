import { describe, expect, it } from 'vitest';
import { createStepFunction, StepJournal } from '../../src/index.ts';
import { rows } from '../storage/harness.ts';
import { openStoreFixture } from './harness.ts';

function journalFixture() {
  const fixture = openStoreFixture();
  return { fixture, journal: new StepJournal(fixture.connection, () => 1) };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('step journal (plan 04 §4.5)', () => {
  it('M1.2-H6 a started but unrecorded step is indeterminate unless retry-safe', async () => {
    const { journal } = journalFixture();
    journal.begin({ messageId: 'm1', name: 'extract', correlationId: 'c' }, false);
    let runs = 0;
    const redelivered = createStepFunction(journal, 'm1', 'c');
    expect(await rejection(redelivered('extract', async () => { runs += 1; return 'text'; }))).toMatchObject({ problem: { code: 'EFFECT_INDETERMINATE', params: { step: 'extract' } } });
    expect(runs).toBe(0);
    const retrySafe = createStepFunction(journal, 'm1', 'c');
    expect(await retrySafe('extract', async () => { runs += 1; return 'text'; }, { retrySafe: true })).toBe('text');
    expect(runs).toBe(1);
  });

  it('M1.2-H7 a reused step name throws STEP_DUPLICATE', async () => {
    const { journal } = journalFixture();
    const step = createStepFunction(journal, 'm2', 'c');
    await step('extract', async () => 1);
    expect(await rejection(step('extract', async () => 2))).toMatchObject({ problem: { code: 'STEP_DUPLICATE' } });
  });

  it('M1.2-E17 a recorded step returns its result without running again', async () => {
    const { journal } = journalFixture();
    await createStepFunction(journal, 'm3', 'c')('call', async () => ({ ok: true }));
    await createStepFunction(journal, 'm3', 'c')('nothing', async () => undefined);
    let runs = 0;
    const rerun = createStepFunction(journal, 'm3', 'c');
    expect(await rerun('call', async () => { runs += 1; return { ok: false }; })).toEqual({ ok: true });
    expect(await rerun('nothing', async () => { runs += 1; return 'x'; })).toBeUndefined();
    expect(runs).toBe(0);
  });

  it('M1.2-E18 a result over 256 KB throws and stays started', async () => {
    const { fixture, journal } = journalFixture();
    const step = createStepFunction(journal, 'm4', 'c');
    expect(await rejection(step('big', async () => 'x'.repeat(256 * 1024)))).toMatchObject({ problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'step-result', max: 262_144 } } });
    expect(rows(fixture.connection, 'SELECT state FROM steps WHERE message_id = ?', 'm4')).toEqual([{ state: 'started' }]);
    expect(await rejection(createStepFunction(journal, 'm4', 'c')('big', async () => 'y'))).toMatchObject({ problem: { code: 'EFFECT_INDETERMINATE' } });
  });

  it('M1.2-E19 a failing effect leaves the step started', async () => {
    const { fixture, journal } = journalFixture();
    const failure = new Error('network down');
    expect(await rejection(createStepFunction(journal, 'm5', 'c')('call', async () => { throw failure; }))).toBe(failure);
    expect(rows(fixture.connection, 'SELECT state FROM steps WHERE message_id = ?', 'm5')).toEqual([{ state: 'started' }]);
  });
});
